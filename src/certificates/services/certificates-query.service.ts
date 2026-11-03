import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "../../../generated/prisma";
import type { AuthUser } from "../../common/auth-user";
import { paginated, skipTake, type Paginated } from "../../common/pagination";
import { localToInstant } from "../../common/workspace-time";
import { PrismaService } from "../../prisma/prisma.service";
import { certificateListStats, issuedByCourse, monthlyIssued, templateUsage } from "../certificate-insights";
import { meetsIssueRules } from "../certificate-rules";
import { issuedInclude, toEvent, toIssued, toTemplate } from "../certificate.mapper";
import type {
  CertificateActivity,
  CertificateDetail,
  CertificateOverview,
  CertificateRecipient,
  CertificateTemplate,
  EligibleLearner,
  IssuedCertificate,
} from "../certificates.types";
import type { ActivityQueryDto, IssuedFilterDto, LearnerQueryDto } from "../dto/certificate.dto";
import { CertificateEligibilityService, validNow } from "./certificate-eligibility.service";

const DAY = 86_400_000;
const EXPORT_MAX = 5000;

/** Read side of admin Certificates: issued list + export, overview stats, detail, templates, activity, learners, eligible queue. */
@Injectable()
export class CertificatesQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eligibility: CertificateEligibilityService,
  ) {}

  /** Certificates of the admin's workspace. Legacy rows (no institutionId) belong to their learner's workspace. */
  scope(actor: Pick<AuthUser, "institutionId">): Prisma.CertificateWhereInput {
    const institutionId = actor.institutionId ?? null;
    return institutionId === null ? { institutionId: null } : { OR: [{ institutionId }, { institutionId: null, user: { institutionId } }] };
  }

  templateScope(actor: Pick<AuthUser, "institutionId">): Prisma.CertificateTemplateWhereInput {
    return { institutionId: actor.institutionId ?? null };
  }

  /** Learners of the admin's workspace. */
  userScope(actor: Pick<AuthUser, "institutionId">): Prisma.UserWhereInput {
    return { institutionId: actor.institutionId ?? null };
  }

  async mustFind(actor: AuthUser, id: string) {
    const row = await this.prisma.certificate.findFirst({ where: { AND: [{ id }, this.scope(actor)] }, include: issuedInclude });
    if (!row) throw new NotFoundException("This certificate no longer exists.");
    return row;
  }

  async mustFindTemplate(actor: AuthUser, id: string) {
    const row = await this.prisma.certificateTemplate.findFirst({ where: { id, ...this.templateScope(actor) } });
    if (!row) throw new NotFoundException("This template no longer exists.");
    return row;
  }

  // ---------------------------------------------------------------- issued

  private issuedWhere(actor: AuthUser, f: IssuedFilterDto, now = new Date()): Prisma.CertificateWhereInput {
    const and: Prisma.CertificateWhereInput[] = [this.scope(actor)];
    if (f.q) {
      const contains = { contains: f.q, mode: "insensitive" as const };
      and.push({ OR: [{ user: { name: contains } }, { user: { email: contains } }, { verificationCode: contains }, { certificateNumber: contains }] });
    }
    if (f.courseId) and.push({ courseId: f.courseId });
    if (f.templateId) and.push({ templateId: f.templateId });
    if (f.method) and.push({ method: f.method });
    if (f.status === "REVOKED") and.push({ status: "REVOKED" });
    if (f.status === "VALID") and.push(validNow(now));
    if (f.status === "EXPIRED") and.push({ status: "VALID", expiresAt: { lt: now } });
    if (f.from) and.push({ issuedAt: { gte: localToInstant(f.from, "00:00")! } });
    if (f.to) and.push({ issuedAt: { lt: new Date(localToInstant(f.to, "00:00")!.getTime() + DAY) } });
    return { AND: and };
  }

  private issuedOrder(f: IssuedFilterDto): Prisma.CertificateOrderByWithRelationInput[] {
    const o = f.sortOrder;
    const first: Prisma.CertificateOrderByWithRelationInput =
      f.sortBy === "name" ? { user: { name: o } } : f.sortBy === "expiresAt" ? { expiresAt: { sort: o, nulls: "last" } } : f.sortBy === "code" ? { verificationCode: o } : { issuedAt: o };
    return [first, { id: "asc" }];
  }

  async list(actor: AuthUser, f: IssuedFilterDto): Promise<Paginated<IssuedCertificate>> {
    const where = this.issuedWhere(actor, f);
    const [rows, total] = await Promise.all([
      this.prisma.certificate.findMany({ where, include: issuedInclude, orderBy: this.issuedOrder(f), ...skipTake(f) }),
      this.prisma.certificate.count({ where }),
    ]);
    return paginated(rows.map(toIssued), total, f);
  }

  /** Every certificate matching the filters (CSV export; capped). */
  async export(actor: AuthUser, f: IssuedFilterDto): Promise<IssuedCertificate[]> {
    const rows = await this.prisma.certificate.findMany({ where: this.issuedWhere(actor, f), include: issuedInclude, orderBy: this.issuedOrder(f), take: EXPORT_MAX });
    return rows.map(toIssued);
  }

  async detail(actor: AuthUser, id: string): Promise<CertificateDetail> {
    const row = await this.mustFind(actor, id);
    const [template, events] = await Promise.all([
      row.templateId ? this.prisma.certificateTemplate.findUnique({ where: { id: row.templateId } }) : null,
      this.prisma.certificateEvent.findMany({ where: { certificateId: id }, orderBy: [{ createdAt: "desc" }, { id: "asc" }] }),
    ]);
    return { certificate: toIssued(row), template: template ? toTemplate(template) : null, events: events.map(toEvent) };
  }

  /** Stat cards, insight strip, monthly chart, by-course card, template usage and tab counts. */
  async overview(actor: AuthUser, now = new Date()): Promise<CertificateOverview> {
    const [certs, templates, eligible] = await Promise.all([
      this.prisma.certificate.findMany({
        where: this.scope(actor),
        select: { id: true, courseId: true, templateId: true, issuedAt: true, expiresAt: true, status: true, method: true, downloads: true, verifications: true },
      }),
      this.prisma.certificateTemplate.findMany({ where: this.templateScope(actor), select: { id: true } }),
      this.eligible(actor),
    ]);
    const courseIds = [...new Set(certs.map((c) => c.courseId))];
    const courses = courseIds.length ? await this.prisma.course.findMany({ where: { id: { in: courseIds } }, select: { id: true, title: true } }) : [];
    return {
      ...certificateListStats(certs, now),
      monthly: monthlyIssued(certs, 6, now),
      byCourse: issuedByCourse(certs, new Map(courses.map((c) => [c.id, c.title]))),
      templateUsage: templateUsage(templates.map((t) => t.id), certs),
      counts: { templates: templates.length, eligible: eligible.length },
    };
  }

  /** Latest events across the workspace (Recent Activity card). */
  async activity(actor: AuthUser, q: ActivityQueryDto): Promise<CertificateActivity[]> {
    const rows = await this.prisma.certificateEvent.findMany({
      where: { certificate: this.scope(actor) },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: q.limit,
      include: { certificate: { select: { verificationCode: true, certificateNumber: true, user: { select: { name: true } } } } },
    });
    return rows.map((r) => ({ ...toEvent(r), code: r.certificate.verificationCode || r.certificate.certificateNumber, recipientName: r.certificate.user.name }));
  }

  // ---------------------------------------------------------------- templates

  async templates(actor: AuthUser): Promise<CertificateTemplate[]> {
    const rows = await this.prisma.certificateTemplate.findMany({ where: this.templateScope(actor), orderBy: [{ createdAt: "desc" }, { id: "asc" }] });
    return rows.map(toTemplate);
  }

  async template(actor: AuthUser, id: string): Promise<CertificateTemplate> {
    return toTemplate(await this.mustFindTemplate(actor, id));
  }

  // ---------------------------------------------------------------- learners + eligible queue

  /** Learner picker: workspace students (enrolled in the course when given), flagged when they already hold a valid certificate. */
  async learners(actor: AuthUser, q: LearnerQueryDto): Promise<(CertificateRecipient & { hasCertificate: boolean })[]> {
    const contains = q.q ? { contains: q.q, mode: "insensitive" as const } : undefined;
    const rows = await this.prisma.user.findMany({
      where: {
        ...this.userScope(actor),
        role: "STUDENT",
        deletedAt: null,
        ...(q.courseId && { enrollments: { some: { courseId: q.courseId } } }),
        ...(contains && { OR: [{ name: contains }, { email: contains }] }),
      },
      select: { id: true, name: true, email: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: q.limit,
    });
    const held = q.courseId
      ? new Set(
          (
            await this.prisma.certificate.findMany({ where: { courseId: q.courseId, userId: { in: rows.map((r) => r.id) }, ...validNow() }, select: { userId: true } })
          ).map((c) => c.userId),
        )
      : new Set<string>();
    return rows.map((r) => ({ ...r, hasCertificate: held.has(r.id) }));
  }

  /**
   * Manual-issue queue: learners of courses whose ACTIVE template is manual (autoIssue off) who meet its rules
   * and hold no valid certificate. Newest completion first.
   */
  async eligible(actor: AuthUser, courseId?: string): Promise<EligibleLearner[]> {
    const templates = await this.prisma.certificateTemplate.findMany({
      where: { ...this.templateScope(actor), status: "ACTIVE", autoIssue: false, ...(courseId && { courseIds: { has: courseId } }) },
      orderBy: { updatedAt: "desc" },
    });
    const seen = new Set<string>();
    const out: EligibleLearner[] = [];
    for (const t of templates) {
      for (const cid of t.courseIds) {
        if ((courseId && cid !== courseId) || seen.has(cid)) continue;
        seen.add(cid);
        const learners = await this.eligibility.courseProgress(cid, this.userScope(actor));
        if (!learners.length) continue;
        const held = new Set(
          (await this.prisma.certificate.findMany({ where: { courseId: cid, userId: { in: learners.map((l) => l.recipient.id) }, ...validNow() }, select: { userId: true } })).map(
            (c) => c.userId,
          ),
        );
        for (const l of learners) {
          if (held.has(l.recipient.id) || !meetsIssueRules(t, l)) continue;
          out.push({ recipient: l.recipient, courseId: cid, completion: l.completion, quizScore: l.quizScore, completedAt: l.completedAt.toISOString() });
        }
      }
    }
    return out.sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  }
}
