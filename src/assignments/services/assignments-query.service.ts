import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "../../../generated/prisma";
import type { AuthUser } from "../../common/auth-user";
import { paginated, skipTake, type Paginated } from "../../common/pagination";
import { PrismaService } from "../../prisma/prisma.service";
import { assignmentInsights, courseStats, submissionCounts } from "../assignment-insights";
import { toAssignmentItem, toSubmission } from "../assignment.mapper";
import type { AssignmentItem, AssignmentListItem, AssignmentSubmission, CourseAssignmentStats, SubmissionCounts } from "../assignments.types";
import type { AssignmentQueryDto, AssignmentStatsQueryDto } from "../dto/assignment.dto";
import type { SubmissionQueryDto } from "../dto/submission.dto";

export const submissionInclude = { user: { select: { id: true, name: true, email: true } } } satisfies Prisma.AssignmentSubmissionInclude;

/** Read side of admin Assignments: list, course stats, details, submissions and analytics. */
@Injectable()
export class AssignmentsQueryService {
  constructor(private readonly prisma: PrismaService) {}

  /** Assignments of the admin's workspace. */
  scope(actor: AuthUser): Prisma.AssignmentWhereInput {
    return { institutionId: actor.institutionId ?? null };
  }

  async mustFind(actor: AuthUser, id: string) {
    const row = await this.prisma.assignment.findFirst({ where: { id, ...this.scope(actor) } });
    if (!row) throw new NotFoundException("This assignment no longer exists.");
    return row;
  }

  async enrolledCounts(courseIds: string[]): Promise<Map<string, number>> {
    if (!courseIds.length) return new Map();
    const rows = await this.prisma.enrollment.groupBy({ by: ["courseId"], where: { courseId: { in: [...new Set(courseIds)] } }, _count: { _all: true } });
    return new Map(rows.map((r) => [r.courseId, r._count._all]));
  }

  private async countsByAssignment(where: Prisma.AssignmentSubmissionWhereInput): Promise<Map<string, SubmissionCounts>> {
    const rows = await this.prisma.assignmentSubmission.groupBy({ by: ["assignmentId", "status", "isLate"], where, _count: { _all: true } });
    const map = new Map<string, SubmissionCounts>();
    for (const r of rows) {
      const c = map.get(r.assignmentId) ?? { total: 0, graded: 0, pending: 0, late: 0 };
      const n = r._count._all;
      c.total += n;
      if (r.status === "GRADED") c.graded += n;
      else c.pending += n;
      if (r.isLate) c.late += n;
      map.set(r.assignmentId, c);
    }
    return map;
  }

  async item(row: Parameters<typeof toAssignmentItem>[0]): Promise<AssignmentItem> {
    const enrolled = await this.enrolledCounts([row.courseId]);
    return toAssignmentItem(row, enrolled.get(row.courseId) ?? 0);
  }

  async list(actor: AuthUser, q: AssignmentQueryDto): Promise<Paginated<AssignmentListItem>> {
    const where: Prisma.AssignmentWhereInput = {
      ...this.scope(actor),
      ...(q.courseId && { courseId: q.courseId }),
      ...(q.moduleId && { moduleId: q.moduleId }),
      ...(q.status && { status: q.status }),
      ...(q.type && { type: q.type }),
      ...(q.q && { OR: [{ title: { contains: q.q, mode: "insensitive" as const } }, { course: { title: { contains: q.q, mode: "insensitive" as const } } }] }),
      ...(q.tab === "pending" && { submissions: { some: { status: "PENDING" } } }),
      ...(q.tab === "graded" && { status: "PUBLISHED", submissions: { some: {}, none: { status: "PENDING" } } }),
      ...(q.tab === "drafts" && { status: "DRAFT" }),
    };
    const orderBy: Prisma.AssignmentOrderByWithRelationInput = { [q.sortBy === "title" ? "title" : q.sortBy]: q.sortOrder };
    const [rows, total] = await Promise.all([
      this.prisma.assignment.findMany({ where, orderBy: [orderBy, { id: "asc" }], ...skipTake(q) }),
      this.prisma.assignment.count({ where }),
    ]);
    const [enrolled, counts] = await Promise.all([
      this.enrolledCounts(rows.map((r) => r.courseId)),
      this.countsByAssignment({ assignmentId: { in: rows.map((r) => r.id) } }),
    ]);
    const data = rows.map((r) => ({
      ...toAssignmentItem(r, enrolled.get(r.courseId) ?? 0),
      submissionCounts: counts.get(r.id) ?? { total: 0, graded: 0, pending: 0, late: 0 },
    }));
    return paginated(data, total, q);
  }

  /** Stat cards of the Assignments list (one course, or the whole workspace). */
  async stats(actor: AuthUser, q: AssignmentStatsQueryDto): Promise<CourseAssignmentStats> {
    const where: Prisma.AssignmentWhereInput = { ...this.scope(actor), ...(q.courseId && { courseId: q.courseId }) };
    const [totalAssignments, subs] = await Promise.all([
      this.prisma.assignment.count({ where }),
      this.prisma.assignmentSubmission.findMany({ where: { assignment: where }, select: { status: true, isLate: true } }),
    ]);
    return courseStats(totalAssignments, submissionCounts(subs));
  }

  async detail(actor: AuthUser, id: string): Promise<AssignmentItem> {
    return this.item(await this.mustFind(actor, id));
  }

  async submissions(actor: AuthUser, id: string, q: SubmissionQueryDto): Promise<Paginated<AssignmentSubmission>> {
    await this.mustFind(actor, id);
    const where: Prisma.AssignmentSubmissionWhereInput = {
      assignmentId: id,
      ...(q.status && { status: q.status }),
      ...(q.late !== undefined && { isLate: q.late }),
      ...(q.q && {
        user: { OR: [{ name: { contains: q.q, mode: "insensitive" as const } }, { email: { contains: q.q, mode: "insensitive" as const } }] },
      }),
    };
    const orderBy: Prisma.AssignmentSubmissionOrderByWithRelationInput =
      q.sortBy === "name" ? { user: { name: q.sortOrder } } : q.sortBy === "score" ? { marksObtained: { sort: q.sortOrder, nulls: "last" } } : { submittedAt: q.sortOrder };
    const [rows, total] = await Promise.all([
      this.prisma.assignmentSubmission.findMany({ where, include: submissionInclude, orderBy: [orderBy, { id: "asc" }], ...skipTake(q) }),
      this.prisma.assignmentSubmission.count({ where }),
    ]);
    return paginated(rows.map(toSubmission), total, q);
  }

  /** Overview + Analytics tabs: every chart and list, computed over all submissions. */
  async insights(actor: AuthUser, id: string) {
    const item = await this.detail(actor, id);
    const rows = await this.prisma.assignmentSubmission.findMany({ where: { assignmentId: id }, include: submissionInclude });
    return assignmentInsights(item, rows.map(toSubmission));
  }
}
