import { Injectable, NotFoundException } from "@nestjs/common";
import type { LiveClass, Prisma } from "../../../generated/prisma";
import type { AuthUser } from "../../common/auth-user";
import { paginated, skipTake, type Paginated, type PaginationQueryDto } from "../../common/pagination";
import { localToInstant } from "../../common/workspace-time";
import { PrismaService } from "../../prisma/prisma.service";
import { attendanceStats, attendanceTimeline, liveListStats, qaStats, topEngaged } from "../live-class-insights";
import { displayStatus, displayStatusWhere, toActivity, toEnrollment, toLiveClassItem, toQuestion, toResource } from "../live-class.mapper";
import { ATTENDED_ROW_STATUSES } from "../live-classes.constants";
import type { LiveActivity, LiveClassListItem, LiveEnrollment, LiveQuestion, LiveResource } from "../live-classes.types";
import type { AttendanceQueryDto, LiveClassQueryDto, LiveStatsQueryDto, QuestionQueryDto } from "../dto/live-class.dto";

const DAY_MS = 86_400_000;
const person = { select: { id: true, name: true, email: true } } as const;
export const listInclude = { course: { select: { id: true, title: true } }, instructor: person } satisfies Prisma.LiveClassInclude;

/** Attendance rows that mean "was in the class". */
export const attendedWhere: Prisma.AttendanceWhereInput = { joinedAt: { not: null }, status: { in: ATTENDED_ROW_STATUSES } };

/** Read side of admin Live Classes. */
@Injectable()
export class LiveClassesQueryService {
  constructor(private readonly prisma: PrismaService) {}

  scope(actor: Pick<AuthUser, "institutionId">): Prisma.LiveClassWhereInput {
    return { institutionId: actor.institutionId ?? null };
  }

  async mustFind(actor: AuthUser, id: string) {
    const row = await this.prisma.liveClass.findFirst({ where: { id, ...this.scope(actor) } });
    if (!row) throw new NotFoundException("This live class no longer exists.");
    return row;
  }

  /**
   * One row per invited student: the course's students (earliest enrolled first, capped by capacity), plus anyone
   * who has an attendance row without being in that list (joined from another seat, marked by an admin).
   */
  async roster(c: Pick<LiveClass, "id" | "courseId" | "capacity" | "endTime">): Promise<LiveEnrollment[]> {
    const [enrollments, rows] = await Promise.all([
      this.prisma.enrollment.findMany({
        where: { courseId: c.courseId },
        orderBy: [{ enrolledAt: "asc" }, { id: "asc" }],
        ...(c.capacity > 0 && { take: c.capacity }),
        select: { enrolledAt: true, user: person },
      }),
      this.prisma.attendance.findMany({ where: { liveClassId: c.id }, include: { user: person } }),
    ]);
    const ended = c.endTime.getTime() <= Date.now();
    const byUser = new Map(rows.map((r) => [r.userId, r]));
    const invited = new Set(enrollments.map((e) => e.user.id));
    return [
      ...enrollments.map((e) => toEnrollment(c.id, e.user, e.enrolledAt, byUser.get(e.user.id), ended)),
      ...rows.filter((r) => !invited.has(r.userId)).map((r) => toEnrollment(c.id, r.user, r.createdAt, r, ended)),
    ];
  }

  private async attendeeCounts(classIds: string[]): Promise<Map<string, number>> {
    if (!classIds.length) return new Map();
    const rows = await this.prisma.attendance.groupBy({ by: ["liveClassId"], where: { liveClassId: { in: classIds }, ...attendedWhere }, _count: { _all: true } });
    return new Map(rows.map((r) => [r.liveClassId, r._count._all]));
  }

  private async invitedCounts(classes: Pick<LiveClass, "courseId" | "capacity">[]): Promise<Map<string, number>> {
    const courseIds = [...new Set(classes.map((c) => c.courseId))];
    if (!courseIds.length) return new Map();
    const rows = await this.prisma.enrollment.groupBy({ by: ["courseId"], where: { courseId: { in: courseIds } }, _count: { _all: true } });
    return new Map(rows.map((r) => [r.courseId, r._count._all]));
  }

  private async toListItems(rows: (LiveClass & Prisma.LiveClassGetPayload<{ include: typeof listInclude }>)[]): Promise<LiveClassListItem[]> {
    const [attendees, enrolled] = await Promise.all([this.attendeeCounts(rows.map((r) => r.id)), this.invitedCounts(rows)]);
    const now = new Date();
    return rows.map((r) => {
      const courseStudents = enrolled.get(r.courseId) ?? 0;
      return {
        ...toLiveClassItem(r),
        displayStatus: displayStatus(r, now),
        course: r.course,
        instructor: r.instructor,
        enrolledCount: r.capacity > 0 ? Math.min(r.capacity, courseStudents) : courseStudents,
        attendees: attendees.get(r.id) ?? 0,
      };
    });
  }

  async list(actor: AuthUser, q: LiveClassQueryDto): Promise<Paginated<LiveClassListItem>> {
    const and: Prisma.LiveClassWhereInput[] = [this.scope(actor)];
    if (q.courseId) and.push({ courseId: q.courseId });
    if (q.instructorId) and.push({ instructorId: q.instructorId });
    if (q.type) and.push({ type: q.type });
    if (q.status) and.push(displayStatusWhere(q.status));
    // Search: title, description, course title or instructor name.
    if (q.q)
      and.push({
        OR: [
          { title: { contains: q.q, mode: "insensitive" } },
          { description: { contains: q.q, mode: "insensitive" } },
          { course: { title: { contains: q.q, mode: "insensitive" } } },
          { instructor: { name: { contains: q.q, mode: "insensitive" } } },
        ],
      });
    if (q.from) and.push({ startTime: { gte: localToInstant(q.from, "00:00")! } });
    if (q.to) and.push({ startTime: { lt: new Date(localToInstant(q.to, "00:00")!.getTime() + DAY_MS) } });
    const where = { AND: and };
    const [rows, total] = await Promise.all([
      this.prisma.liveClass.findMany({ where, include: listInclude, orderBy: [{ [q.sortBy]: q.sortOrder }, { id: "asc" }], ...skipTake(q) }),
      this.prisma.liveClass.count({ where }),
    ]);
    return paginated(await this.toListItems(rows), total, q);
  }

  async stats(actor: AuthUser, q: LiveStatsQueryDto) {
    const classes = await this.prisma.liveClass.findMany({
      where: { ...this.scope(actor), ...(q.courseId && { courseId: q.courseId }) },
      select: { id: true, status: true, startTime: true, endTime: true },
    });
    return liveListStats(classes, await this.attendeeCounts(classes.map((c) => c.id)));
  }

  async detail(actor: AuthUser, id: string): Promise<LiveClassListItem> {
    await this.mustFind(actor, id);
    const row = await this.prisma.liveClass.findUniqueOrThrow({ where: { id }, include: listInclude });
    return (await this.toListItems([row]))[0];
  }

  async attendance(actor: AuthUser, id: string, q: AttendanceQueryDto): Promise<Paginated<LiveEnrollment>> {
    const c = await this.mustFind(actor, id);
    const needle = q.q?.toLowerCase();
    const rows = (await this.roster(c)).filter(
      (r) => (!q.status || r.status === q.status) && (!needle || r.student.name.toLowerCase().includes(needle) || r.student.email.toLowerCase().includes(needle)),
    );
    const { skip, take } = skipTake(q);
    return paginated(rows.slice(skip, skip + take), rows.length, q);
  }

  /** Overview / Attendance tabs: stats, presence timeline, most engaged, Q&A counts. */
  async insights(actor: AuthUser, id: string) {
    const c = await this.mustFind(actor, id);
    const [rows, questions] = await Promise.all([this.roster(c), this.prisma.liveQuestion.findMany({ where: { liveClassId: id }, select: { status: true } })]);
    const durationMinutes = Math.round((c.endTime.getTime() - c.startTime.getTime()) / 60_000);
    return {
      durationMinutes,
      attendance: attendanceStats(rows),
      timeline: attendanceTimeline(rows, c),
      topEngaged: topEngaged(rows).map((r) => ({ ...r, watchPct: durationMinutes ? Math.min(100, Math.round((r.watchMinutes / durationMinutes) * 100)) : 0 })),
      qa: qaStats(questions.map((x) => ({ status: x.status === "ANSWERED" ? "ANSWERED" : "PENDING" }))),
    };
  }

  async questions(actor: AuthUser, id: string, q: QuestionQueryDto): Promise<Paginated<LiveQuestion>> {
    await this.mustFind(actor, id);
    const where: Prisma.LiveQuestionWhereInput = { liveClassId: id, ...(q.status && { status: q.status }) };
    const [rows, total] = await Promise.all([
      this.prisma.liveQuestion.findMany({ where, include: { user: person }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], ...skipTake(q) }),
      this.prisma.liveQuestion.count({ where }),
    ]);
    return paginated(rows.map(toQuestion), total, q);
  }

  async resources(actor: AuthUser, id: string): Promise<LiveResource[]> {
    await this.mustFind(actor, id);
    const rows = await this.prisma.liveResource.findMany({ where: { liveClassId: id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    return rows.map(toResource);
  }

  async activity(actor: AuthUser, id: string, q: PaginationQueryDto): Promise<Paginated<LiveActivity>> {
    await this.mustFind(actor, id);
    const [rows, total] = await Promise.all([
      this.prisma.liveClassEvent.findMany({ where: { liveClassId: id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], ...skipTake(q) }),
      this.prisma.liveClassEvent.count({ where: { liveClassId: id } }),
    ]);
    return paginated(rows.map(toActivity), total, q);
  }
}
