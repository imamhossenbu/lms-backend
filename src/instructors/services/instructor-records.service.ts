import { Injectable } from "@nestjs/common";
import type { Prisma } from "../../../generated/prisma";
import { paginated, skipTake, type Paginated } from "../../common/pagination";
import { PrismaService } from "../../prisma/prisma.service";
import type { InstructorStudentsQueryDto, ScheduleQueryDto } from "../dto/instructor.dto";
import { deviceFromUserAgent, PAID_ORDER_STATUS, round1 } from "../instructors.constants";
import type {
  ActivityLogEntry,
  InstructorReviewRow,
  InstructorStudentRow,
  ReviewSummary,
  ScheduleEvent,
  ScheduleEventStatus,
} from "../instructors.types";

const DAY_MS = 86_400_000;
const REVIEW_STATUS: Record<string, InstructorReviewRow["status"]> = { PENDING: "Pending", APPROVED: "Approved", REJECTED: "Rejected" };
const studentSelect = { select: { id: true, name: true, email: true, avatar: true } } as const;
const toStudent = (u: { id: string; name: string; email: string; avatar: string | null }) => ({ id: u.id, name: u.name, email: u.email, avatarUrl: u.avatar });

/** Instructor details tabs: students, reviews, schedule, activity log. */
@Injectable()
export class InstructorRecordsService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------- students

  /** Enrollments in the instructor's courses, newest first. */
  async students(instructorId: string, query: InstructorStudentsQueryDto): Promise<Paginated<InstructorStudentRow>> {
    const where: Prisma.EnrollmentWhereInput = {
      course: { instructorId },
      user: { deletedAt: null },
      ...(query.courseId ? { courseId: query.courseId } : {}),
      ...(query.q
        ? { user: { deletedAt: null, OR: [{ name: { contains: query.q, mode: "insensitive" } }, { email: { contains: query.q, mode: "insensitive" } }] } }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.enrollment.count({ where }),
      this.prisma.enrollment.findMany({
        where,
        orderBy: [{ enrolledAt: "desc" }, { id: "asc" }],
        include: { user: studentSelect, course: { select: { id: true, title: true } } },
        ...skipTake(query),
      }),
    ]);
    return paginated(
      rows.map((e) => ({
        id: e.id,
        student: toStudent(e.user),
        course: e.course,
        enrolledOn: e.enrolledAt.toISOString(),
        progress: e.progressPercentage,
        status: e.status === "ACTIVE" ? "Active" : "Inactive",
      })),
      total,
      query,
    );
  }

  // ---------------------------------------------------------------- reviews

  /** All reviews on the instructor's courses (any status) + a summary of the approved ones. */
  async reviews(instructorId: string): Promise<{ summary: ReviewSummary; data: InstructorReviewRow[] }> {
    const rows = await this.prisma.courseReview.findMany({
      where: { course: { instructorId } },
      orderBy: { createdAt: "desc" },
      include: { user: studentSelect, course: { select: { id: true, title: true } } },
    });
    const approved = rows.filter((r) => r.status === "APPROVED");
    const distribution: ReviewSummary["distribution"] = [0, 0, 0, 0, 0];
    for (const r of approved) if (r.rating >= 1 && r.rating <= 5) distribution[r.rating - 1]++;
    const average = approved.length ? round1(approved.reduce((s, r) => s + r.rating, 0) / approved.length) : 0;

    return {
      summary: { average, total: approved.length, distribution },
      data: rows.map((r) => ({
        id: r.id,
        student: toStudent(r.user),
        course: r.course,
        rating: r.rating,
        comment: r.reviewText ?? "",
        status: REVIEW_STATUS[r.status] ?? "Pending",
        date: r.createdAt.toISOString(),
      })),
    };
  }

  // ---------------------------------------------------------------- schedule

  /** Live classes taught + assignment due dates in the instructor's courses, within [from, to]. */
  async schedule(instructorId: string, query: ScheduleQueryDto): Promise<ScheduleEvent[]> {
    const now = new Date();
    const from = query.from ? new Date(query.from) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const to = query.to ? new Date(query.to) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 1));

    const [liveClasses, assignments] = await Promise.all([
      this.prisma.liveClass.findMany({
        where: { instructorId, startTime: { lt: to }, endTime: { gte: from } },
        orderBy: { startTime: "asc" },
        include: { course: { select: { id: true, title: true } } },
      }),
      this.prisma.assignment.findMany({
        where: { course: { instructorId }, dueDate: { gte: from, lt: to } },
        orderBy: { dueDate: "asc" },
        include: { course: { select: { id: true, title: true } } },
      }),
    ]);

    const liveStatus = (status: string, end: Date): ScheduleEventStatus =>
      status === "CANCELLED" ? "Cancelled" : status === "COMPLETED" || end < now ? "Completed" : "Upcoming";

    const events: ScheduleEvent[] = [
      ...liveClasses.map((l) => ({
        id: `live-${l.id}`,
        title: l.title,
        type: "live" as const,
        course: l.course,
        start: l.startTime.toISOString(),
        end: l.endTime.toISOString(),
        status: liveStatus(l.status, l.endTime),
        meetingUrl: l.meetingUrl,
      })),
      ...assignments.map((a) => ({
        id: `assignment-${a.id}`,
        title: `${a.title} (due)`,
        type: "assignment" as const,
        course: a.course,
        // Shown as a 1-hour block ending at the deadline.
        start: new Date(a.dueDate.getTime() - DAY_MS / 24).toISOString(),
        end: a.dueDate.toISOString(),
        status: (a.dueDate < now ? "Completed" : "Upcoming") as ScheduleEventStatus,
        meetingUrl: null,
      })),
    ];
    return events.sort((a, b) => a.start.localeCompare(b.start));
  }

  // ---------------------------------------------------------------- activity

  /** Timeline of what happened around this instructor, newest first. */
  async activity(instructorId: string, limit = 100): Promise<ActivityLogEntry[]> {
    const inMyCourses = { course: { instructorId } };
    const [instructor, logs, enrollments, reviews, liveClasses, sales, notes] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: instructorId }, select: { name: true, avatar: true } }),
      this.prisma.activityLog.findMany({ where: { userId: instructorId }, orderBy: { createdAt: "desc" }, take: limit }),
      this.prisma.enrollment.findMany({ where: inMyCourses, orderBy: { enrolledAt: "desc" }, take: limit, include: { user: studentSelect, course: { select: { title: true } } } }),
      this.prisma.courseReview.findMany({ where: inMyCourses, orderBy: { createdAt: "desc" }, take: limit, include: { user: studentSelect, course: { select: { title: true } } } }),
      this.prisma.liveClass.findMany({ where: { instructorId, startTime: { lte: new Date() } }, orderBy: { startTime: "desc" }, take: limit, include: { course: { select: { title: true } } } }),
      this.prisma.order.findMany({ where: { ...inMyCourses, status: PAID_ORDER_STATUS }, orderBy: { createdAt: "desc" }, take: limit, include: { course: { select: { title: true } } } }),
      this.prisma.instructorNote.findMany({ where: { instructorId }, orderBy: { createdAt: "desc" }, take: limit, include: { author: { select: { name: true, avatar: true, role: true } } } }),
    ]);

    const me = { name: instructor.name, role: "Instructor" as const, avatarUrl: instructor.avatar };
    const system = { name: "System", role: "Automated" as const, avatarUrl: null };
    const entries: ActivityLogEntry[] = [
      ...logs.map((l) => ({ id: `log-${l.id}`, type: "account_action" as const, at: l.createdAt.toISOString(), actor: me, details: l.action, ip: l.ipAddress || null, device: deviceFromUserAgent(l.userAgent) })),
      ...enrollments.map((e) => ({
        id: `enroll-${e.id}`,
        type: "student_enrolled" as const,
        at: e.enrolledAt.toISOString(),
        actor: { name: e.user.name, role: "Student" as const, avatarUrl: e.user.avatar },
        details: `Enrolled in ${e.course.title}`,
        ip: null,
        device: "System" as const,
      })),
      ...reviews.map((r) => ({
        id: `review-${r.id}`,
        type: "new_review" as const,
        at: r.createdAt.toISOString(),
        actor: { name: r.user.name, role: "Student" as const, avatarUrl: r.user.avatar },
        details: `Left a ${r.rating}-star review on ${r.course.title}`,
        ip: null,
        device: "System" as const,
      })),
      ...liveClasses.map((l) => ({ id: `live-${l.id}`, type: "live_class" as const, at: l.startTime.toISOString(), actor: me, details: `Hosted live class "${l.title}" (${l.course.title})`, ip: null, device: "System" as const })),
      ...sales.map((o) => ({
        id: `earning-${o.id}`,
        type: "earning" as const,
        at: o.createdAt.toISOString(),
        actor: system,
        details: `${o.currency} ${Number(o.totalAmount).toLocaleString("en-US")} from ${o.course.title} (${o.orderNumber})`,
        ip: null,
        device: "System" as const,
      })),
      ...notes.map((n) => ({
        id: `note-${n.id}`,
        type: "note_added" as const,
        at: n.createdAt.toISOString(),
        actor: { name: n.author.name, role: n.author.role === "SUPER_ADMIN" ? ("Super Admin" as const) : ("Admin" as const), avatarUrl: n.author.avatar },
        details: `Added note "${n.title}"`,
        ip: null,
        device: "Web" as const,
      })),
    ];
    return entries.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
  }
}
