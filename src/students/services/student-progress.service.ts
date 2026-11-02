import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { letterGrade, pct } from "../students.constants";
import type {
  AssignmentSubmissionLabel,
  EnrolledCourseStatus,
  StudentActivityItem,
  StudentAssignmentItem,
  StudentCertificateItem,
  StudentCourseItem,
  StudentDetails,
  StudentQuizItem,
} from "../students.types";

/** Aggregates shown in the student list row. */
export interface StudentSummary {
  enrolledCoursesCount: number;
  completedCoursesCount: number;
  completionRate: number;
  averageScore: number;
  totalWatchSeconds: number;
}

const EMPTY_SUMMARY: StudentSummary = { enrolledCoursesCount: 0, completedCoursesCount: 0, completionRate: 0, averageScore: 0, totalWatchSeconds: 0 };

const isCompleted = (e: { completedAt: Date | null; progressPercentage: number }) => !!e.completedAt || e.progressPercentage >= 100;

/**
 * Read-only learning data for students: list summaries (batched, no N+1), detail metrics and the detail-page tabs.
 * Everything is derived from enrollments, lesson progress, quiz attempts, assignment submissions and certificates.
 */
@Injectable()
export class StudentProgressService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------- list summaries

  /** Summaries for many students in 4 queries total. */
  async summaries(studentIds: string[]): Promise<Map<string, StudentSummary>> {
    const result = new Map<string, StudentSummary>(studentIds.map((id) => [id, { ...EMPTY_SUMMARY }]));
    if (studentIds.length === 0) return result;

    const [enrollments, watch, bestScores] = await Promise.all([
      this.prisma.enrollment.findMany({ where: { userId: { in: studentIds } }, select: { userId: true, completedAt: true, progressPercentage: true } }),
      this.prisma.lessonProgress.groupBy({ by: ["userId"], where: { userId: { in: studentIds } }, _sum: { watchedSeconds: true } }),
      this.prisma.quizAttempt.groupBy({ by: ["userId", "quizId"], where: { userId: { in: studentIds } }, _max: { percentage: true } }),
    ]);

    for (const e of enrollments) {
      const s = result.get(e.userId)!;
      s.enrolledCoursesCount++;
      if (isCompleted(e)) s.completedCoursesCount++;
    }
    for (const w of watch) result.get(w.userId)!.totalWatchSeconds = w._sum.watchedSeconds ?? 0;

    const scores = new Map<string, number[]>();
    for (const b of bestScores) scores.set(b.userId, [...(scores.get(b.userId) ?? []), Number(b._max.percentage ?? 0)]);
    for (const [userId, list] of scores) result.get(userId)!.averageScore = Math.round(list.reduce((a, b) => a + b, 0) / list.length);

    for (const s of result.values()) s.completionRate = pct(s.completedCoursesCount, s.enrolledCoursesCount);
    return result;
  }

  // ---------------------------------------------------------------- detail metrics

  async metrics(studentId: string): Promise<Pick<StudentDetails, "overallProgress" | "learningMetrics">> {
    const enrollments = await this.prisma.enrollment.findMany({ where: { userId: studentId }, select: { courseId: true, progressPercentage: true } });
    const courseIds = enrollments.map((e) => e.courseId);
    const inCourses = { courseId: { in: courseIds } };

    const [totalLessons, completedLessons, quizzes, bestScores, totalAssignments, submitted, certificates] = await Promise.all([
      this.prisma.lesson.count({ where: inCourses }),
      this.prisma.lessonProgress.count({ where: { userId: studentId, isCompleted: true, ...inCourses } }),
      this.prisma.quiz.findMany({ where: inCourses, select: { id: true, passingScore: true } }),
      this.prisma.quizAttempt.groupBy({ by: ["quizId"], where: { userId: studentId }, _max: { score: true } }),
      this.prisma.assignment.count({ where: inCourses }),
      this.prisma.assignmentSubmission.findMany({ where: { userId: studentId, assignment: inCourses }, distinct: ["assignmentId"], select: { id: true } }),
      this.prisma.certificate.count({ where: { userId: studentId, ...inCourses } }),
    ]);

    const best = new Map(bestScores.map((b) => [b.quizId, b._max.score ?? 0]));
    const quizzesPassed = quizzes.filter((q) => (best.get(q.id) ?? -1) >= q.passingScore).length;
    const metric = (current: number, total: number) => ({ current, total, percentage: pct(current, total) });
    const overallProgress = enrollments.length ? Math.round(enrollments.reduce((s, e) => s + e.progressPercentage, 0) / enrollments.length) : 0;

    return {
      overallProgress,
      learningMetrics: {
        completedLessons: metric(completedLessons, totalLessons),
        quizzesPassed: metric(quizzesPassed, quizzes.length),
        assignmentsSubmitted: metric(submitted.length, totalAssignments),
        certificatesEarned: metric(certificates, enrollments.length),
      },
    };
  }

  // ---------------------------------------------------------------- tabs

  async courses(studentId: string): Promise<StudentCourseItem[]> {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { userId: studentId },
      orderBy: { enrolledAt: "desc" },
      include: {
        course: {
          select: {
            id: true,
            title: true,
            slug: true,
            thumbnail: true,
            category: { select: { name: true } },
            instructor: { select: { id: true, name: true, avatar: true } },
          },
        },
      },
    });
    const courseIds = enrollments.map((e) => e.courseId);
    const [lessonTotals, lessonDone, certificates] = await Promise.all([
      this.prisma.lesson.groupBy({ by: ["courseId"], where: { courseId: { in: courseIds } }, _count: { _all: true } }),
      this.prisma.lessonProgress.groupBy({ by: ["courseId"], where: { userId: studentId, isCompleted: true, courseId: { in: courseIds } }, _count: { _all: true } }),
      this.prisma.certificate.findMany({ where: { userId: studentId, courseId: { in: courseIds } }, select: { courseId: true } }),
    ]);
    const totals = new Map(lessonTotals.map((l) => [l.courseId, l._count._all]));
    const done = new Map(lessonDone.map((l) => [l.courseId, l._count._all]));
    const certified = new Set(certificates.map((c) => c.courseId));

    return enrollments.map((e) => {
      const status: EnrolledCourseStatus = isCompleted(e) ? "Completed" : e.progressPercentage > 0 ? "In Progress" : "Not Started";
      return {
        id: e.course.id,
        enrollmentId: e.id,
        title: e.course.title,
        slug: e.course.slug,
        thumbnailUrl: e.course.thumbnail,
        category: e.course.category.name,
        instructor: { id: e.course.instructor.id, name: e.course.instructor.name, avatarUrl: e.course.instructor.avatar },
        progress: e.progressPercentage,
        status,
        completedLessons: done.get(e.courseId) ?? 0,
        totalLessons: totals.get(e.courseId) ?? 0,
        enrolledDate: e.enrolledAt.toISOString(),
        completedDate: e.completedAt?.toISOString() ?? null,
        lastAccessedAt: e.lastAccessedAt?.toISOString() ?? null,
        certificateEarned: certified.has(e.courseId),
      };
    });
  }

  private async enrolledCourseIds(studentId: string) {
    return (await this.prisma.enrollment.findMany({ where: { userId: studentId }, select: { courseId: true } })).map((e) => e.courseId);
  }

  /** Every quiz in the student's courses with their best attempt. */
  async quizzes(studentId: string): Promise<StudentQuizItem[]> {
    const courseIds = await this.enrolledCourseIds(studentId);
    const quizzes = await this.prisma.quiz.findMany({
      where: { courseId: { in: courseIds } },
      orderBy: { title: "asc" },
      include: {
        course: { select: { title: true } },
        attempts: { where: { userId: studentId }, orderBy: [{ score: "desc" }, { submittedAt: "desc" }] },
      },
    });
    return quizzes.map((q) => {
      const best = q.attempts[0];
      return {
        id: q.id,
        title: q.title,
        courseId: q.courseId,
        course: q.course.title,
        attemptsCount: q.attempts.length,
        attemptedOn: best?.submittedAt.toISOString() ?? null,
        scoreCurrent: best?.score ?? null,
        scoreTotal: q.totalMarks,
        percentage: best ? Math.round(Number(best.percentage)) : null,
        passingScore: q.passingScore,
        status: !best ? "Not Attempted" : best.score >= q.passingScore ? "Passed" : "Failed",
        timeTakenSeconds: best ? Math.max(0, Math.round((best.submittedAt.getTime() - best.startedAt.getTime()) / 1000)) : null,
      };
    });
  }

  /** Every assignment in the student's courses with their latest submission. */
  async assignments(studentId: string): Promise<StudentAssignmentItem[]> {
    const courseIds = await this.enrolledCourseIds(studentId);
    const now = Date.now();
    const assignments = await this.prisma.assignment.findMany({
      where: { courseId: { in: courseIds } },
      orderBy: { dueDate: "asc" },
      include: {
        course: { select: { title: true } },
        submissions: { where: { userId: studentId }, orderBy: { submittedAt: "desc" }, take: 1 },
      },
    });
    return assignments.map((a) => {
      const sub = a.submissions[0];
      const submissionStatus: AssignmentSubmissionLabel = sub ? "Submitted" : a.dueDate.getTime() > now ? "Pending" : "Not Submitted";
      const marks = sub?.marksObtained ?? null;
      return {
        id: a.id,
        title: a.title,
        courseId: a.courseId,
        courseTitle: a.course.title,
        dueDate: a.dueDate.toISOString(),
        submissionStatus,
        submittedOn: sub?.submittedAt.toISOString() ?? null,
        marksObtained: marks,
        totalMarks: a.marks,
        grade: marks === null ? null : letterGrade(pct(marks, a.marks)),
        fileUrl: sub?.fileUrl ?? null,
      };
    });
  }

  /** Issued certificates, plus a "Not Earned" row for each enrolled course without one. */
  async certificates(studentId: string): Promise<StudentCertificateItem[]> {
    const [issued, enrollments] = await Promise.all([
      this.prisma.certificate.findMany({ where: { userId: studentId }, orderBy: { issuedAt: "desc" }, include: { course: { select: { title: true } } } }),
      this.prisma.enrollment.findMany({ where: { userId: studentId }, include: { course: { select: { id: true, title: true } } } }),
    ]);
    const earned = new Set(issued.map((c) => c.courseId));
    return [
      ...issued.map((c) => ({
        id: c.id,
        courseId: c.courseId,
        course: c.course.title,
        status: "Issued" as const,
        issuedOn: c.issuedAt.toISOString(),
        certificateId: c.certificateNumber,
        verificationCode: c.verificationCode,
        certificateUrl: c.certificateUrl,
      })),
      ...enrollments
        .filter((e) => !earned.has(e.courseId))
        .map((e) => ({
          id: `pending-${e.courseId}`,
          courseId: e.courseId,
          course: e.course.title,
          status: "Not Earned" as const,
          issuedOn: null,
          certificateId: null,
          verificationCode: null,
          certificateUrl: null,
        })),
    ];
  }

  /** Learning timeline (newest first), built from the student's records. */
  async activity(studentId: string, joinedAt: Date, limit = 100): Promise<StudentActivityItem[]> {
    const [enrollments, attempts, submissions, certificates] = await Promise.all([
      this.prisma.enrollment.findMany({ where: { userId: studentId }, orderBy: { enrolledAt: "desc" }, take: limit, include: { course: { select: { title: true } } } }),
      this.prisma.quizAttempt.findMany({
        where: { userId: studentId },
        orderBy: { submittedAt: "desc" },
        take: limit,
        include: { quiz: { select: { title: true, totalMarks: true, passingScore: true, course: { select: { title: true } } } } },
      }),
      this.prisma.assignmentSubmission.findMany({
        where: { userId: studentId },
        orderBy: { submittedAt: "desc" },
        take: limit,
        include: { assignment: { select: { title: true, course: { select: { title: true } } } } },
      }),
      this.prisma.certificate.findMany({ where: { userId: studentId }, orderBy: { issuedAt: "desc" }, take: limit, include: { course: { select: { title: true } } } }),
    ]);

    const items: StudentActivityItem[] = [
      ...enrollments.map((e) => ({
        id: `enroll-${e.id}`,
        activityType: "enrolled_course" as const,
        activityTitle: "Enrolled in course",
        details: `Started learning ${e.course.title}`,
        relatedItemName: e.course.title,
        relatedItemType: "Course" as const,
        at: e.enrolledAt.toISOString(),
      })),
      ...attempts.map((a) => {
        const passed = a.score >= a.quiz.passingScore;
        return {
          id: `quiz-${a.id}`,
          activityType: passed ? ("completed_quiz" as const) : ("failed_quiz" as const),
          activityTitle: passed ? "Passed quiz" : "Failed quiz",
          details: `Scored ${a.score}/${a.quiz.totalMarks} (${Math.round(Number(a.percentage))}%) in ${a.quiz.course.title}`,
          relatedItemName: a.quiz.title,
          relatedItemType: "Quiz" as const,
          at: a.submittedAt.toISOString(),
        };
      }),
      ...submissions.map((s) => ({
        id: `assignment-${s.id}`,
        activityType: "submitted_assignment" as const,
        activityTitle: "Submitted assignment",
        details: `Submitted for ${s.assignment.course.title}`,
        relatedItemName: s.assignment.title,
        relatedItemType: "Assignment" as const,
        at: s.submittedAt.toISOString(),
      })),
      ...certificates.map((c) => ({
        id: `certificate-${c.id}`,
        activityType: "earned_certificate" as const,
        activityTitle: "Earned certificate",
        details: `Certificate ${c.certificateNumber}`,
        relatedItemName: c.course.title,
        relatedItemType: "Certificate" as const,
        at: c.issuedAt.toISOString(),
      })),
      {
        id: `account-${studentId}`,
        activityType: "account_created",
        activityTitle: "Account created",
        details: "Joined the platform",
        relatedItemName: "Student account",
        relatedItemType: "Account",
        at: joinedAt.toISOString(),
      },
    ];
    return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
  }
}
