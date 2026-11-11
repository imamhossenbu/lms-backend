import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "../../generated/prisma";
import { AuthService } from "../auth/auth.service";
import { sanitizeRichText } from "../common/html";
import { PrismaService } from "../prisma/prisma.service";
import type { AttemptQueryDto, QuestionQueryDto, SubmissionQueryDto, TeacherPageQueryDto, TeacherProfileDto } from "./dto/teacher.dto";

const page = (q: { page?: number; limit?: number }) => ({ page: q.page ?? 1, limit: q.limit ?? 10 });
const meta = (total: number, p: number, l: number) => ({ total, page: p, limit: l, totalPages: Math.max(1, Math.ceil(total / l)) });

/**
 * Teacher mode of the admin panel: everything is limited to courses where the signed-in TEACHER is the instructor,
 * inside their own workspace. Teachers read their students and results, grade submissions, answer questions and
 * keep their own profile; course building and settings stay with admins.
 */
@Injectable()
export class TeacherService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  /** The teacher's course ids (optionally one of them, else 404). */
  private async courseIds(userId: string, tenantId: string | null, only?: string): Promise<string[]> {
    const rows = await this.prisma.course.findMany({ where: { instructorId: userId, institutionId: tenantId }, select: { id: true } });
    const ids = rows.map((r) => r.id);
    if (only) {
      if (!ids.includes(only)) throw new NotFoundException("Course not found");
      return [only];
    }
    return ids;
  }

  // ---------------------------------------------------------------- dashboard

  async dashboard(userId: string, tenantId: string | null) {
    const ids = await this.courseIds(userId, tenantId);
    const now = new Date();
    const [courses, students, pending, reviews, upcoming, recent, questions] = await Promise.all([
      this.prisma.course.findMany({ where: { id: { in: ids } }, select: { status: true } }),
      this.prisma.enrollment.findMany({ where: { courseId: { in: ids }, status: "ACTIVE" }, distinct: ["userId"], select: { userId: true } }),
      this.prisma.assignmentSubmission.count({ where: { status: { not: "GRADED" }, assignment: { courseId: { in: ids } } } }),
      this.prisma.courseReview.aggregate({ where: { courseId: { in: ids }, status: "APPROVED" }, _avg: { rating: true }, _count: { _all: true } }),
      this.liveRows(userId, ids, "upcoming", 3),
      this.prisma.assignmentSubmission.findMany({
        where: { assignment: { courseId: { in: ids } } },
        orderBy: { submittedAt: "desc" },
        take: 5,
        select: { id: true, status: true, submittedAt: true, isLate: true, user: { select: { name: true, avatar: true } }, assignment: { select: { title: true, course: { select: { title: true } } } } },
      }),
      this.prisma.discussion.count({ where: { courseId: { in: ids }, category: "QUESTION", isResolved: false, isHidden: false, replies: { none: { userId, isRemoved: false } } } }),
    ]);
    return {
      stats: {
        courses: courses.length,
        publishedCourses: courses.filter((c) => c.status === "PUBLISHED").length,
        students: students.length,
        pendingSubmissions: pending,
        openQuestions: questions,
        rating: Math.round((reviews._avg.rating ?? 0) * 10) / 10,
        reviews: reviews._count._all,
      },
      upcomingLive: upcoming,
      recentSubmissions: recent.map((s) => ({ id: s.id, status: s.status === "GRADED" ? "GRADED" : "PENDING", submittedAt: s.submittedAt, isLate: s.isLate, student: s.user, assignment: s.assignment.title, course: s.assignment.course.title })),
      now,
    };
  }

  // ---------------------------------------------------------------- courses

  async courses(userId: string, tenantId: string | null) {
    const rows = await this.prisma.course.findMany({
      where: { instructorId: userId, institutionId: tenantId },
      orderBy: { title: "asc" },
      select: {
        id: true,
        title: true,
        slug: true,
        thumbnail: true,
        status: true,
        level: true,
        price: true,
        isFree: true,
        ratingAverage: true,
        category: { select: { name: true } },
        _count: { select: { enrollments: { where: { status: "ACTIVE" } }, reviews: { where: { status: "APPROVED" } }, assignments: true, quizzes: true, liveClasses: true } },
      },
    });
    const ids = rows.map((r) => r.id);
    const [lessons, pending] = await Promise.all([
      ids.length ? this.prisma.lesson.groupBy({ by: ["courseId"], where: { courseId: { in: ids }, status: "PUBLISHED" }, _count: { _all: true } }) : [],
      ids.length ? this.prisma.assignmentSubmission.findMany({ where: { status: { not: "GRADED" }, assignment: { courseId: { in: ids } } }, select: { assignment: { select: { courseId: true } } } }) : [],
    ]);
    return rows.map(({ _count, ...c }) => ({
      ...c,
      price: Number(c.price),
      rating: Math.round(Number(c.ratingAverage) * 10) / 10,
      students: _count.enrollments,
      reviews: _count.reviews,
      assignments: _count.assignments,
      quizzes: _count.quizzes,
      liveClasses: _count.liveClasses,
      lessons: lessons.find((l) => l.courseId === c.id)?._count._all ?? 0,
      pendingSubmissions: pending.filter((p) => p.assignment.courseId === c.id).length,
    }));
  }

  async course(userId: string, tenantId: string | null, courseId: string) {
    await this.courseIds(userId, tenantId, courseId);
    const [course, modules, reviews, progress] = await Promise.all([
      this.prisma.course.findUniqueOrThrow({ where: { id: courseId }, select: { id: true, title: true, slug: true, thumbnail: true, status: true, level: true, shortDescription: true, ratingAverage: true, category: { select: { name: true } } } }),
      this.prisma.courseModule.findMany({ where: { courseId }, orderBy: { order: "asc" }, select: { id: true, title: true, lessons: { orderBy: { order: "asc" }, select: { id: true, title: true, type: true, status: true, durationMinutes: true, isPreview: true, _count: { select: { progress: { where: { isCompleted: true } } } } } } } }),
      this.prisma.courseReview.findMany({ where: { courseId, status: "APPROVED" }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, rating: true, reviewText: true, createdAt: true, user: { select: { name: true, avatar: true } } } }),
      this.prisma.enrollment.aggregate({ where: { courseId, status: "ACTIVE" }, _avg: { progressPercentage: true }, _count: { _all: true } }),
    ]);
    const completed = await this.prisma.enrollment.count({ where: { courseId, status: "ACTIVE", completedAt: { not: null } } });
    return {
      ...course,
      rating: Math.round(Number(course.ratingAverage) * 10) / 10,
      students: progress._count._all,
      averageProgress: Math.round(progress._avg.progressPercentage ?? 0),
      completed,
      modules: modules.map((m) => ({ ...m, lessons: m.lessons.map(({ _count, ...l }) => ({ ...l, completions: _count.progress })) })),
      reviews,
    };
  }

  // ---------------------------------------------------------------- students

  async students(userId: string, tenantId: string | null, q: TeacherPageQueryDto) {
    const ids = await this.courseIds(userId, tenantId, q.courseId);
    const { page: p, limit } = page(q);
    const where: Prisma.EnrollmentWhereInput = {
      courseId: { in: ids },
      status: "ACTIVE",
      ...(q.q ? { user: { OR: [{ name: { contains: q.q, mode: "insensitive" } }, { email: { contains: q.q, mode: "insensitive" } }] } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.enrollment.findMany({
        where,
        orderBy: { enrolledAt: "desc" },
        skip: (p - 1) * limit,
        take: limit,
        select: { id: true, enrolledAt: true, progressPercentage: true, completedAt: true, lastAccessedAt: true, user: { select: { id: true, name: true, email: true, avatar: true } }, course: { select: { id: true, title: true } } },
      }),
      this.prisma.enrollment.count({ where }),
    ]);
    return { data: rows, meta: meta(total, p, limit) };
  }

  // ---------------------------------------------------------------- submissions

  async submissions(userId: string, tenantId: string | null, q: SubmissionQueryDto) {
    const ids = await this.courseIds(userId, tenantId, q.courseId);
    const { page: p, limit } = page(q);
    const where: Prisma.AssignmentSubmissionWhereInput = {
      assignment: { courseId: { in: ids } },
      ...(q.status === "GRADED" ? { status: "GRADED" } : q.status === "PENDING" ? { status: { not: "GRADED" } } : {}),
      ...(q.q ? { OR: [{ user: { name: { contains: q.q, mode: "insensitive" } } }, { user: { email: { contains: q.q, mode: "insensitive" } } }, { assignment: { title: { contains: q.q, mode: "insensitive" } } }] } : {}),
    };
    const [rows, total, pending] = await Promise.all([
      this.prisma.assignmentSubmission.findMany({
        where,
        orderBy: { submittedAt: q.status === "GRADED" ? "desc" : "asc" },
        skip: (p - 1) * limit,
        take: limit,
        select: {
          id: true,
          status: true,
          submittedAt: true,
          isLate: true,
          attempt: true,
          fileUrl: true,
          fileName: true,
          textAnswer: true,
          marksObtained: true,
          feedback: true,
          gradedAt: true,
          user: { select: { id: true, name: true, email: true, avatar: true } },
          assignment: { select: { id: true, title: true, type: true, marks: true, dueDate: true, course: { select: { id: true, title: true } } } },
        },
      }),
      this.prisma.assignmentSubmission.count({ where }),
      this.prisma.assignmentSubmission.count({ where: { status: { not: "GRADED" }, assignment: { courseId: { in: ids } } } }),
    ]);
    return { data: rows.map((r) => ({ ...r, status: r.status === "GRADED" ? "GRADED" : "PENDING" })), meta: meta(total, p, limit), pending };
  }

  async grade(userId: string, tenantId: string | null, id: string, marks: number, feedback: string | undefined) {
    const ids = await this.courseIds(userId, tenantId);
    const sub = await this.prisma.assignmentSubmission.findFirst({ where: { id, assignment: { courseId: { in: ids } } }, select: { id: true, assignment: { select: { marks: true } } } });
    if (!sub) throw new NotFoundException("Submission not found");
    if (marks > sub.assignment.marks) throw new BadRequestException(`Marks can be at most ${sub.assignment.marks}.`);
    return this.prisma.assignmentSubmission.update({
      where: { id },
      data: { marksObtained: marks, feedback: feedback?.trim() || null, status: "GRADED", gradedAt: new Date(), gradedById: userId },
      select: { id: true, status: true, marksObtained: true, feedback: true, gradedAt: true },
    });
  }

  // ---------------------------------------------------------------- quiz attempts

  async attempts(userId: string, tenantId: string | null, q: AttemptQueryDto) {
    const ids = await this.courseIds(userId, tenantId, q.courseId);
    const { page: p, limit } = page(q);
    const where: Prisma.QuizAttemptWhereInput = {
      quiz: { courseId: { in: ids } },
      ...(q.result ? { passed: q.result === "passed" } : {}),
      ...(q.q ? { OR: [{ user: { name: { contains: q.q, mode: "insensitive" } } }, { quiz: { title: { contains: q.q, mode: "insensitive" } } }] } : {}),
    };
    const [rows, total, agg] = await Promise.all([
      this.prisma.quizAttempt.findMany({
        where,
        orderBy: { submittedAt: "desc" },
        skip: (p - 1) * limit,
        take: limit,
        select: { id: true, score: true, totalMarks: true, percentage: true, passed: true, attemptNumber: true, timeTakenSeconds: true, submittedAt: true, user: { select: { name: true, email: true, avatar: true } }, quiz: { select: { title: true, course: { select: { title: true } } } } },
      }),
      this.prisma.quizAttempt.count({ where }),
      this.prisma.quizAttempt.aggregate({ where: { quiz: { courseId: { in: ids } } }, _avg: { percentage: true }, _count: { _all: true } }),
    ]);
    const passed = await this.prisma.quizAttempt.count({ where: { quiz: { courseId: { in: ids } }, passed: true } });
    return {
      data: rows.map((r) => ({ ...r, percentage: Number(r.percentage) })),
      meta: meta(total, p, limit),
      stats: { attempts: agg._count._all, averagePercentage: Math.round(Number(agg._avg.percentage ?? 0)), passRate: agg._count._all ? Math.round((passed / agg._count._all) * 100) : 0 },
    };
  }

  // ---------------------------------------------------------------- live classes

  private async liveRows(userId: string, courseIds: string[], when: "upcoming" | "past", take: number) {
    const now = new Date();
    const rows = await this.prisma.liveClass.findMany({
      where: { OR: [{ instructorId: userId }, { courseId: { in: courseIds } }], status: { not: "CANCELLED" }, ...(when === "upcoming" ? { endTime: { gt: now } } : { endTime: { lte: now } }) },
      orderBy: { startTime: when === "upcoming" ? "asc" : "desc" },
      take,
      select: { id: true, title: true, startTime: true, endTime: true, meetingUrl: true, recordingUrl: true, platform: true, course: { select: { title: true } }, _count: { select: { attendances: true } } },
    });
    return rows.map(({ _count, ...r }) => ({ ...r, attendees: _count.attendances, status: now >= r.startTime && now < r.endTime ? "LIVE" : now >= r.endTime ? "ENDED" : "UPCOMING" }));
  }

  async liveClasses(userId: string, tenantId: string | null, when: "upcoming" | "past") {
    return this.liveRows(userId, await this.courseIds(userId, tenantId), when, 100);
  }

  // ---------------------------------------------------------------- questions (community QUESTION threads)

  async questions(userId: string, tenantId: string | null, q: QuestionQueryDto) {
    const ids = await this.courseIds(userId, tenantId, q.courseId);
    const { page: p, limit } = page(q);
    const open: Prisma.DiscussionWhereInput = { isResolved: false, replies: { none: { userId, isRemoved: false } } };
    const where: Prisma.DiscussionWhereInput = {
      courseId: { in: ids },
      category: "QUESTION",
      isHidden: false,
      ...(q.status === "answered" ? { NOT: open } : q.status === "open" ? open : {}),
      ...(q.q ? { title: { contains: q.q, mode: "insensitive" } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.discussion.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (p - 1) * limit,
        take: limit,
        select: {
          id: true,
          title: true,
          body: true,
          isResolved: true,
          createdAt: true,
          courseId: true,
          userId: true,
          replies: { where: { isRemoved: false }, orderBy: { createdAt: "asc" }, select: { id: true, body: true, userId: true, isAccepted: true, createdAt: true } },
        },
      }),
      this.prisma.discussion.count({ where }),
    ]);
    const userIds = [...new Set(rows.flatMap((r) => [r.userId, ...r.replies.map((x) => x.userId)]))];
    const [users, courses] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, avatar: true, role: true } }),
      this.prisma.course.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.courseId))] } }, select: { id: true, title: true } }),
    ]);
    const who = (id: string) => users.find((u) => u.id === id) ?? { id, name: "Learner", avatar: null, role: "STUDENT" };
    return {
      data: rows.map((r) => ({
        id: r.id,
        title: r.title,
        bodyHtml: r.body,
        isResolved: r.isResolved,
        createdAt: r.createdAt,
        course: courses.find((c) => c.id === r.courseId)?.title ?? "",
        author: who(r.userId),
        answered: r.replies.some((x) => x.userId === userId),
        replies: r.replies.map((x) => ({ id: x.id, bodyHtml: x.body, isAccepted: x.isAccepted, createdAt: x.createdAt, author: who(x.userId), mine: x.userId === userId })),
      })),
      meta: meta(total, p, limit),
    };
  }

  async reply(userId: string, tenantId: string | null, discussionId: string, body: string) {
    const ids = await this.courseIds(userId, tenantId);
    const thread = await this.prisma.discussion.findFirst({ where: { id: discussionId, courseId: { in: ids }, isHidden: false }, select: { id: true, isLocked: true } });
    if (!thread) throw new NotFoundException("Question not found");
    if (thread.isLocked) throw new ForbiddenException("This thread is locked.");
    const clean = sanitizeRichText(body.includes("<") ? body : `<p>${body.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!).replace(/\n/g, "<br>")}</p>`);
    if (!clean.replace(/<[^>]*>/g, "").trim()) throw new BadRequestException("Write your answer");
    const now = new Date();
    const [reply] = await this.prisma.$transaction([
      this.prisma.discussionReply.create({ data: { discussionId, userId, body: clean, createdAt: now }, select: { id: true, body: true, createdAt: true } }),
      this.prisma.discussion.update({ where: { id: discussionId }, data: { updatedAt: now } }),
    ]);
    return reply;
  }

  // ---------------------------------------------------------------- profile

  profile(userId: string) {
    return this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, name: true, email: true, phone: true, avatar: true, headline: true, bio: true, expertise: true, createdAt: true } });
  }

  updateProfile(userId: string, dto: TeacherProfileDto) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { name: dto.name, phone: dto.phone || null, headline: dto.headline || null, bio: dto.bio || null, expertise: dto.expertise || null },
      select: { id: true, name: true, email: true, phone: true, avatar: true, headline: true, bio: true, expertise: true, createdAt: true },
    });
  }

  changePassword(userId: string, currentPassword: string, newPassword: string) {
    return this.auth.changePassword(userId, { currentPassword, newPassword });
  }
}
