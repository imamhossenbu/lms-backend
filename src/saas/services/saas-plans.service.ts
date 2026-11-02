import { BadRequestException, ConflictException, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { DEFAULT_PLANS, normalizeSlug } from "../saas.constants";
import { toPlanView } from "../saas.mapper";
import { sortPlans } from "../saas.math";
import type { PlanView } from "../saas.types";
import type { PlanDto } from "../dto/plan.dto";
import { SaasCoreService, type Tx } from "./saas-core.service";

/** Plans & pricing (Owner Console › Plans) + public pricing list. */
@Injectable()
export class SaasPlansService implements OnModuleInit {
  private readonly logger = new Logger(SaasPlansService.name);

  constructor(private readonly core: SaasCoreService) {}

  /** Seeds the four built-in tiers on first boot (no-op once any plan exists). */
  async onModuleInit() {
    try {
      const count = await this.core.prisma.saasPlan.count();
      if (count > 0) return;
      await this.core.prisma.saasPlan.createMany({ data: DEFAULT_PLANS, skipDuplicates: true });
      this.logger.log(`Seeded ${DEFAULT_PLANS.length} default SaaS plans`);
    } catch (err: any) {
      // Table missing (schema not pushed yet) must not crash the whole API.
      this.logger.warn(`Could not seed SaaS plans: ${err?.message ?? err}`);
    }
  }

  async list(): Promise<PlanView[]> {
    return sortPlans(await this.core.plans());
  }

  /** Plans offered on the public pricing / signup page. */
  async listPublic(): Promise<PlanView[]> {
    return (await this.list()).filter((p) => p.isPublic && !p.archived);
  }

  async subscriberCounts(): Promise<Record<string, number>> {
    const rows = await this.core.prisma.institution.groupBy({ by: ["planId"], where: { status: { not: "CANCELLED" } }, _count: { _all: true } });
    return Object.fromEntries(rows.map((r) => [r.planId, r._count._all]));
  }

  private assertPrices(v: PlanDto) {
    if (v.priceMonthly > 0 && v.priceYearly <= 0) throw new BadRequestException("Set a yearly price (or 0 for both to mark the plan custom-priced).");
    if (v.priceMonthly === 0 && v.priceYearly > 0) throw new BadRequestException("Set a monthly price too.");
    if (v.priceMonthly > 0 && v.priceYearly > v.priceMonthly * 12) throw new BadRequestException("Yearly price should not exceed 12 × the monthly price.");
  }

  private async assertNameFree(tx: Tx, name: string, exceptId?: string) {
    const clash = await tx.saasPlan.findFirst({ where: { name: { equals: name, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) } });
    if (clash) throw new ConflictException("Another plan already uses this name.");
  }

  private data(v: PlanDto) {
    return {
      name: v.name,
      tagline: v.tagline,
      priceMonthly: v.priceMonthly,
      priceYearly: v.priceYearly,
      limitStudents: v.limits.students,
      limitCourses: v.limits.courses,
      limitTeamMembers: v.limits.teamMembers,
      limitStorageGb: v.limits.storageGb,
      features: v.features,
      highlighted: v.highlighted,
      isPublic: v.isPublic,
      trialDays: v.trialDays,
    };
  }

  /** Next free custom plan id: `plan-<slug>` (then `plan-<slug>-2`, …). */
  private async customPlanId(tx: Tx, name: string) {
    const base = `plan-${normalizeSlug(name) || "custom"}`;
    const taken = new Set((await tx.saasPlan.findMany({ where: { id: { startsWith: base } }, select: { id: true } })).map((p) => p.id));
    let id = base;
    for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
    return id;
  }

  /** Creates a custom plan. Only one plan can be highlighted — highlighting this one clears the others. */
  async create(v: PlanDto): Promise<PlanView> {
    this.assertPrices(v);
    return this.core.tx(async (tx) => {
      await this.assertNameFree(tx, v.name);
      if (v.highlighted) await tx.saasPlan.updateMany({ data: { highlighted: false } });
      const row = await tx.saasPlan.create({ data: { id: await this.customPlanId(tx, v.name), ...this.data(v) } });
      return toPlanView(row);
    });
  }

  async update(id: string, v: PlanDto): Promise<PlanView> {
    this.assertPrices(v);
    return this.core.tx(async (tx) => {
      await this.core.mustPlan(tx, id);
      await this.assertNameFree(tx, v.name, id);
      if (v.highlighted) await tx.saasPlan.updateMany({ where: { id: { not: id } }, data: { highlighted: false } });
      return toPlanView(await tx.saasPlan.update({ where: { id }, data: this.data(v) }));
    });
  }

  /** Archived plans disappear from signup / plan pickers; existing subscribers keep them. */
  async setArchived(id: string, archived: boolean): Promise<PlanView> {
    return this.core.tx(async (tx) => {
      const plan = await this.core.mustPlan(tx, id);
      if (archived && plan.isPublic) {
        const otherPublic = await tx.saasPlan.count({ where: { id: { not: id }, archived: false, isPublic: true } });
        if (otherPublic === 0) throw new BadRequestException("Keep at least one public plan available for signups.");
      }
      const row = await tx.saasPlan.update({ where: { id }, data: { archived, ...(archived ? { highlighted: false } : {}) } });
      return toPlanView(row);
    });
  }
}
