import { ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";
import { toPlanView } from "../saas/saas.mapper";
import { sortPlans } from "../saas/saas.math";
import type { FeatureKey, LimitKey } from "../saas/saas.constants";
import type { PlanView } from "../saas/saas.types";

/** Labels match the panel's FEATURE_META / LIMIT_META (src/lib/planAccess.ts). */
export const FEATURE_LABEL: Record<FeatureKey, string> = {
  liveClasses: "Live classes",
  certificates: "Certificates",
  community: "Community",
  aiAssistant: "AI assistant",
  advancedAnalytics: "Advanced analytics",
  customDomain: "Custom domain",
  whiteLabel: "White-label branding",
  apiAccess: "API access",
  prioritySupport: "Priority support",
};
const LIMIT_LABEL: Record<LimitKey, string> = { students: "students", courses: "courses", teamMembers: "team members", storageGb: "GB of storage" };

export type Usage = Record<LimitKey, number>;

interface Workspace {
  status: string;
  plan: PlanView;
  storageGb: number;
}

/**
 * Server-side plan enforcement — the API twin of the panel's PlanGate / LimitGuard.
 *  - assertFeature(tenant, feature): the plan includes the feature and the workspace is active
 *  - assertCanAdd(tenant, limit, n): adding n more stays within the plan limit (live counts)
 *  - usage / refreshUsage: real counts, also written to Institution.usage* (owner console, plan changes)
 * The legacy single-tenant workspace (tenant null) has no plan and is never gated.
 * Errors are 403 with a machine-readable `code` so the panel can show the upgrade prompt.
 */
@Injectable()
export class PlanAccessService {
  private readonly logger = new Logger(PlanAccessService.name);

  constructor(private readonly prisma: PrismaService) {}

  private async workspace(tenantId: string): Promise<Workspace | null> {
    const inst = await this.prisma.institution.findUnique({ where: { id: tenantId }, select: { status: true, usageStorageGb: true, plan: true } });
    return inst ? { status: inst.status, plan: toPlanView(inst.plan), storageGb: inst.usageStorageGb } : null;
  }

  private assertActive(ws: Workspace) {
    if (ws.status === "SUSPENDED" || ws.status === "CANCELLED")
      throw new ForbiddenException({
        statusCode: 403,
        error: "Forbidden",
        code: "WORKSPACE_INACTIVE",
        message: ws.status === "SUSPENDED" ? "Your workspace is suspended. Contact support to restore access." : "Your subscription has ended. Reactivate it from Billing to continue.",
      });
  }

  /** Cheapest active plan that includes the feature (for the upgrade message). */
  private async requiredPlan(feature: FeatureKey): Promise<PlanView | null> {
    const plans = (await this.prisma.saasPlan.findMany({ where: { archived: false } })).map(toPlanView);
    return sortPlans(plans).find((p) => p.features.includes(feature)) ?? null;
  }

  async hasFeature(tenantId: string | null, feature: FeatureKey): Promise<boolean> {
    if (tenantId === null) return true;
    const ws = await this.workspace(tenantId);
    if (!ws || ws.status === "SUSPENDED" || ws.status === "CANCELLED") return false;
    return ws.plan.features.includes(feature);
  }

  async assertFeature(tenantId: string | null, feature: FeatureKey): Promise<void> {
    if (tenantId === null) return;
    const ws = await this.workspace(tenantId);
    if (!ws) return;
    this.assertActive(ws);
    if (ws.plan.features.includes(feature)) return;
    const required = await this.requiredPlan(feature);
    throw new ForbiddenException({
      statusCode: 403,
      error: "Forbidden",
      code: "PLAN_FEATURE_REQUIRED",
      feature,
      requiredPlanId: required?.id ?? null,
      message: `${FEATURE_LABEL[feature]} ${feature === "liveClasses" || feature === "certificates" ? "aren't" : "isn't"} included in your ${ws.plan.name} plan.${required ? ` Upgrade to ${required.name} or higher to unlock it.` : ""}`,
    });
  }

  /** Live counts for one workspace. Storage isn't metered yet, so it keeps the stored value. */
  async usage(tenantId: string): Promise<Usage> {
    const [students, courses, staff, instructors, inst] = await Promise.all([
      this.prisma.user.count({ where: { institutionId: tenantId, role: "STUDENT", deletedAt: null } }),
      this.prisma.course.count({ where: { institutionId: tenantId } }),
      // Seats = team members (incl. pending invites) + instructors, as the panel's LIMIT_META describes.
      this.prisma.teamMember.count({ where: { institutionId: tenantId } }),
      this.prisma.user.count({ where: { institutionId: tenantId, role: "TEACHER", deletedAt: null } }),
      this.prisma.institution.findUnique({ where: { id: tenantId }, select: { usageStorageGb: true } }),
    ]);
    return { students, courses, teamMembers: Math.max(1, staff + instructors), storageGb: inst?.usageStorageGb ?? 0 };
  }

  /** Recomputes and stores Institution.usage* — returns the fresh counts. */
  async refreshUsage(tenantId: string): Promise<Usage> {
    const u = await this.usage(tenantId);
    await this.prisma.institution.updateMany({
      where: { id: tenantId },
      data: { usageStudents: u.students, usageCourses: u.courses, usageTeamMembers: u.teamMembers },
    });
    return u;
  }

  /** Throws PLAN_LIMIT_REACHED when adding `count` more would exceed the plan (null limit = unlimited). */
  async assertCanAdd(tenantId: string | null, key: LimitKey, count = 1): Promise<void> {
    if (tenantId === null || count <= 0) return;
    const ws = await this.workspace(tenantId);
    if (!ws) return;
    this.assertActive(ws);
    const limit = ws.plan.limits[key];
    if (limit === null) return;
    const used = (await this.refreshUsage(tenantId))[key];
    if (used + count <= limit) return;
    const left = Math.max(0, limit - used);
    throw new ForbiddenException({
      statusCode: 403,
      error: "Forbidden",
      code: "PLAN_LIMIT_REACHED",
      limit: key,
      usage: used,
      max: limit,
      message: `Your ${ws.plan.name} plan allows ${limit.toLocaleString("en-US")} ${LIMIT_LABEL[key]} (${used.toLocaleString("en-US")} used${count > 1 ? `, ${left} left` : ""}). Upgrade your plan to add more.`,
    });
  }

  /** Keeps every workspace's usage counters fresh for the Owner Console and plan-change checks. */
  @Cron(CronExpression.EVERY_30_MINUTES, { name: "plan-usage-refresh" })
  async refreshAll() {
    const institutions = await this.prisma.institution.findMany({ where: { status: { not: "CANCELLED" } }, select: { id: true } });
    for (const { id } of institutions) {
      try {
        await this.refreshUsage(id);
      } catch (err: any) {
        this.logger.warn(`Usage refresh failed for ${id}: ${err?.message ?? err}`);
      }
    }
  }
}
