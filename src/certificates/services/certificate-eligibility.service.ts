import { Injectable } from "@nestjs/common";
import type { Prisma } from "../../../generated/prisma";
import { PrismaService } from "../../prisma/prisma.service";
import { averageQuizScore, type LearnerProgress } from "../certificate-rules";
import type { CertificateRecipient } from "../certificates.types";

/** Enrollments that no longer count toward a certificate. */
const INACTIVE_ENROLLMENT = ["CANCELLED", "BLOCKED", "REFUNDED"];

export interface LearnerCourseProgress extends LearnerProgress {
  recipient: CertificateRecipient;
  completedAt: Date;
}

/** Validity filter: stored VALID and not past expiresAt. */
export const validNow = (now: Date = new Date()): Prisma.CertificateWhereInput => ({
  status: "VALID",
  OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
});

/** Reads course completion, quiz scores and assignment results to evaluate a template's issue rules. */
@Injectable()
export class CertificateEligibilityService {
  constructor(private readonly prisma: PrismaService) {}

  /** Progress of every (or the given) enrolled learner of a course, restricted to the given user filter. */
  async courseProgress(courseId: string, users: Prisma.UserWhereInput, userIds?: string[]): Promise<LearnerCourseProgress[]> {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { courseId, status: { notIn: INACTIVE_ENROLLMENT }, ...(userIds && { userId: { in: userIds } }), user: { ...users, deletedAt: null } },
      select: { userId: true, progressPercentage: true, completedAt: true, lastAccessedAt: true, enrolledAt: true, user: { select: { id: true, name: true, email: true } } },
    });
    if (!enrollments.length) return [];
    const ids = enrollments.map((e) => e.userId);

    const [quizzes, assignments] = await Promise.all([
      this.prisma.quiz.findMany({ where: { courseId, status: "PUBLISHED" }, select: { id: true } }),
      this.prisma.assignment.findMany({ where: { courseId, status: "PUBLISHED" }, select: { id: true, passingScore: true } }),
    ]);
    const quizIds = quizzes.map((q) => q.id);
    const [attempts, graded] = await Promise.all([
      quizIds.length
        ? this.prisma.quizAttempt.groupBy({ by: ["userId", "quizId"], where: { quizId: { in: quizIds }, userId: { in: ids }, completed: true }, _max: { percentage: true } })
        : Promise.resolve([]),
      assignments.length
        ? this.prisma.assignmentSubmission.groupBy({
            by: ["userId", "assignmentId"],
            where: { assignmentId: { in: assignments.map((a) => a.id) }, userId: { in: ids }, status: "GRADED" },
            _max: { marksObtained: true },
          })
        : Promise.resolve([]),
    ]);

    const best = new Map<string, Map<string, number>>();
    for (const a of attempts) {
      const m = best.get(a.userId) ?? new Map<string, number>();
      m.set(a.quizId, Number(a._max.percentage ?? 0));
      best.set(a.userId, m);
    }
    const marks = new Map<string, Map<string, number>>();
    for (const g of graded) {
      const m = marks.get(g.userId) ?? new Map<string, number>();
      m.set(g.assignmentId, g._max.marksObtained ?? 0);
      marks.set(g.userId, m);
    }

    return enrollments.map((e) => {
      const own = marks.get(e.userId);
      return {
        recipient: { id: e.user.id, name: e.user.name, email: e.user.email },
        completion: e.progressPercentage,
        quizScore: averageQuizScore(quizIds, best.get(e.userId) ?? new Map()),
        assignmentsPassed: assignments.every((a) => own?.has(a.id) && own.get(a.id)! >= (a.passingScore ?? 0)),
        completedAt: e.completedAt ?? e.lastAccessedAt ?? e.enrolledAt,
      };
    });
  }
}
