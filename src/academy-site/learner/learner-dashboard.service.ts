import { Injectable } from "@nestjs/common";
import { AuthService } from "../../auth/auth.service";
import { verifyUrl } from "../../certificates/certificates.constants";
import { statusLabel } from "../../commerce/order-status";
import { PrismaService } from "../../prisma/prisma.service";
import { LearnerAuthService } from "./learner-auth.service";

const JOIN_EARLY_MS = 15 * 60_000;

/**
 * The learner's dashboard on an academy site: overview, courses, live classes, assignments, quiz results,
 * certificates, orders and profile / password. Everything is scoped to the signed-in learner of this academy.
 */
@Injectable()
export class LearnerDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly learners: LearnerAuthService,
    private readonly auth: AuthService,
  ) {}

  /** Tenant + the learner's active enrollments (course ids) in it. */
  private async scope(slug: string, userId: string) {
    const inst = await this.learners.academy(slug);
    const [user, enrollments] = await Promise.all([
      this.learners.me(slug, userId),
      this.prisma.enrollment.findMany({ where: { userId, status: "ACTIVE", course: { institutionId: inst.id } }, select: { courseId: true } }),
    ]);
    return { inst, user, courseIds: enrollments.map((e) => e.courseId) };
  }

  // ---------------------------------------------------------------- overview

  async overview(slug: string, userId: string) {
    const { courseIds } = await this.scope(slug, userId);
    const now = new Date();
    const [enrollments, lessonsDone, certificates, upcoming, quizzes, pendingAssignments, lastProgress] = await Promise.all([
      this.prisma.enrollment.findMany({ where: { userId, courseId: { in: courseIds } }, select: { progressPercentage: true, completedAt: true, lastAccessedAt: true, courseId: true } }),
      this.prisma.lessonProgress.count({ where: { userId, courseId: { in: courseIds }, isCompleted: true } }),
      this.prisma.certificate.count({ where: { userId, courseId: { in: courseIds }, status: "VALID" } }),
      this.liveRows(courseIds, "upcoming", 3),
      this.quizRows(userId, courseIds, 3),
      this.assignmentRows(userId, courseIds).then((a) => a.filter((x) => x.state === "TODO" || x.state === "OVERDUE").length),
      this.prisma.lessonProgress.findFirst({
        where: { userId, courseId: { in: courseIds } },
        orderBy: { completedAt: { sort: "desc", nulls: "last" } },
        select: { courseId: true },
      }),
    ]);
    // "Continue learning": most recently opened unfinished course, else the last one with progress.
    const unfinished = enrollments.filter((e) => !e.completedAt);
    const pick =
      unfinished.sort((a, b) => (b.lastAccessedAt?.getTime() ?? 0) - (a.lastAccessedAt?.getTime() ?? 0))[0]?.courseId ?? lastProgress?.courseId ?? null;
    const course = pick ? await this.prisma.course.findUnique({ where: { id: pick }, select: { slug: true, title: true, thumbnail: true, instructor: { select: { name: true } } } }) : null;
    const pickProgress = enrollments.find((e) => e.courseId === pick)?.progressPercentage ?? 0;
    return {
      stats: {
        courses: enrollments.length,
        completedCourses: enrollments.filter((e) => e.completedAt).length,
        lessonsCompleted: lessonsDone,
        averageProgress: enrollments.length ? Math.round(enrollments.reduce((s, e) => s + e.progressPercentage, 0) / enrollments.length) : 0,
        certificates,
        pendingAssignments,
      },
      continueLearning: course ? { slug: course.slug, title: course.title, thumbnail: course.thumbnail, instructor: course.instructor.name, progress: pickProgress } : null,
      upcomingLive: upcoming,
      recentQuizzes: quizzes,
      generatedAt: now,
    };
  }

  // ---------------------------------------------------------------- live classes

  private async liveRows(courseIds: string[], when: "upcoming" | "past", take: number) {
    const now = new Date();
    const rows = await this.prisma.liveClass.findMany({
      where: { courseId: { in: courseIds }, status: { not: "CANCELLED" }, ...(when === "upcoming" ? { endTime: { gt: now } } : { endTime: { lte: now } }) },
      orderBy: { startTime: when === "upcoming" ? "asc" : "desc" },
      take,
      select: { id: true, title: true, description: true, startTime: true, endTime: true, meetingUrl: true, recordingUrl: true, sendLinkToStudents: true, platform: true, course: { select: { slug: true, title: true } }, instructor: { select: { name: true } } },
    });
    return rows.map((r) => {
      const live = now >= r.startTime && now < r.endTime;
      const joinable = r.sendLinkToStudents && now.getTime() >= r.startTime.getTime() - JOIN_EARLY_MS && now < r.endTime;
      return {
        id: r.id,
        title: r.title,
        description: r.description ?? "",
        startTime: r.startTime,
        endTime: r.endTime,
        status: live ? "LIVE" : now >= r.endTime ? "ENDED" : "UPCOMING",
        // The meeting link is only handed out shortly before the class starts.
        joinUrl: joinable ? r.meetingUrl : null,
        recordingUrl: now >= r.endTime ? (r.recordingUrl ?? null) : null,
        platform: r.platform,
        course: r.course,
        instructor: r.instructor.name,
      };
    });
  }

  async liveClasses(slug: string, userId: string, when: "upcoming" | "past") {
    const { courseIds } = await this.scope(slug, userId);
    return this.liveRows(courseIds, when, 50);
  }

  // ---------------------------------------------------------------- assignments

  private async assignmentRows(userId: string, courseIds: string[]) {
    const now = new Date();
    const rows = await this.prisma.assignment.findMany({
      where: { courseId: { in: courseIds }, status: "PUBLISHED", OR: [{ releaseAt: null }, { releaseAt: { lte: now } }] },
      orderBy: { dueDate: "asc" },
      select: {
        id: true,
        title: true,
        type: true,
        dueDate: true,
        marks: true,
        instructionsHtml: true,
        description: true,
        allowedFileTypes: true,
        maxFileSizeMb: true,
        maxAttempts: true,
        lateSubmission: true,
        course: { select: { slug: true, title: true } },
        submissions: { where: { userId }, orderBy: { submittedAt: "desc" }, select: { id: true, status: true, submittedAt: true, marksObtained: true, feedback: true, attempt: true, isLate: true, fileUrl: true, fileName: true, textAnswer: true } },
      },
    });
    return rows.map(({ submissions, ...a }) => {
      const last = submissions[0] ?? null;
      const state = last ? (last.status === "GRADED" ? "GRADED" : "SUBMITTED") : now > a.dueDate ? "OVERDUE" : "TODO";
      const attemptsLeft = a.maxAttempts === null ? null : Math.max(0, a.maxAttempts - submissions.length);
      return { ...a, state, attempts: submissions.length, attemptsLeft, canSubmit: (attemptsLeft === null || attemptsLeft > 0) && !(now > a.dueDate && a.lateSubmission === "DISALLOW"), lastSubmission: last };
    });
  }

  async assignments(slug: string, userId: string) {
    const { courseIds } = await this.scope(slug, userId);
    return this.assignmentRows(userId, courseIds);
  }

  // ---------------------------------------------------------------- quiz results

  private async quizRows(userId: string, courseIds: string[], take: number) {
    const rows = await this.prisma.quizAttempt.findMany({
      where: { userId, quiz: { courseId: { in: courseIds } } },
      orderBy: { submittedAt: "desc" },
      take,
      select: { id: true, score: true, totalMarks: true, percentage: true, passed: true, attemptNumber: true, submittedAt: true, quiz: { select: { title: true, lessonId: true, course: { select: { slug: true, title: true } } } } },
    });
    return rows.map((r) => ({ id: r.id, quizTitle: r.quiz.title, lessonId: r.quiz.lessonId || null, course: r.quiz.course, score: r.score, totalMarks: r.totalMarks, percentage: Number(r.percentage), passed: r.passed, attemptNumber: r.attemptNumber, submittedAt: r.submittedAt }));
  }

  async quizResults(slug: string, userId: string) {
    const { courseIds } = await this.scope(slug, userId);
    return this.quizRows(userId, courseIds, 50);
  }

  // ---------------------------------------------------------------- certificates & orders

  async certificates(slug: string, userId: string) {
    const { inst } = await this.scope(slug, userId);
    const rows = await this.prisma.certificate.findMany({
      where: { userId, course: { institutionId: inst.id } },
      orderBy: { issuedAt: "desc" },
      select: { id: true, certificateNumber: true, verificationCode: true, certificateUrl: true, issuedAt: true, status: true, grade: true, expiresAt: true, course: { select: { slug: true, title: true, thumbnail: true } } },
    });
    return rows.map((r) => ({ ...r, verifyUrl: verifyUrl(r.verificationCode), certificateUrl: r.certificateUrl || null }));
  }

  async orders(slug: string, userId: string) {
    const { inst } = await this.scope(slug, userId);
    const rows = await this.prisma.order.findMany({
      where: { userId, course: { institutionId: inst.id } },
      orderBy: { createdAt: "desc" },
      select: { id: true, orderNumber: true, status: true, totalAmount: true, discountAmount: true, currency: true, paymentMethod: true, createdAt: true, paidAt: true, course: { select: { slug: true, title: true, thumbnail: true } } },
    });
    const invoices = rows.length ? await this.prisma.invoice.findMany({ where: { orderId: { in: rows.map((r) => r.id) } }, select: { orderId: true, invoiceUrl: true, invoiceNumber: true } }) : [];
    return rows.map((r) => ({
      ...r,
      status: statusLabel(r.status).toUpperCase(),
      totalAmount: Number(r.totalAmount),
      discountAmount: Number(r.discountAmount),
      invoice: invoices.find((i) => i.orderId === r.id) ?? null,
    }));
  }

  // ---------------------------------------------------------------- profile

  async profile(slug: string, userId: string) {
    await this.scope(slug, userId);
    return this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, name: true, email: true, phone: true, avatar: true, bio: true, country: true, createdAt: true } });
  }

  async updateProfile(slug: string, userId: string, dto: { name: string; phone?: string; bio?: string; country?: string }) {
    await this.scope(slug, userId);
    return this.prisma.user.update({
      where: { id: userId },
      data: { name: dto.name, phone: dto.phone || null, bio: dto.bio || null, country: dto.country || null },
      select: { id: true, name: true, email: true, phone: true, avatar: true, bio: true, country: true, createdAt: true },
    });
  }

  async changePassword(slug: string, userId: string, currentPassword: string, newPassword: string) {
    await this.scope(slug, userId);
    return this.auth.changePassword(userId, { currentPassword, newPassword });
  }
}
