import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { AuthUser } from "../common/auth-user";
import { PrismaService } from "../prisma/prisma.service";
import type { SubmitQuizDto } from "../quizzes/dto/attempt.dto";
import { attemptLimitReason, quizClosedReason, shuffled } from "../quizzes/quiz-gate";
import { gradeAttempt, missingRequired } from "../quizzes/quiz-grading";
import { toQuizItem, type QuizWithQuestions } from "../quizzes/quiz.mapper";
import type { QuizItem } from "../quizzes/quizzes.types";
import { withQuestions } from "../quizzes/services/quizzes-query.service";
import { LessonAccessService } from "../lession/lesson-access.service";

/** A quiz as a student may see it before submitting: no correct answers, accepted answers or explanations. */
function forStudent(q: QuizItem) {
  const questions = (q.randomizeQuestions ? shuffled(q.questions) : q.questions).map((x) => ({
    id: x.id,
    kind: x.kind,
    questionHtml: x.questionHtml,
    options: q.randomizeOptions || x.shuffleOptions ? shuffled(x.options) : x.options,
    points: x.points,
    timeLimitSeconds: x.timeLimitSeconds,
    required: x.required,
  }));
  return {
    id: q.id,
    title: q.title,
    descriptionHtml: q.descriptionHtml,
    instructionsHtml: q.instructionsHtml,
    courseId: q.courseId,
    moduleId: q.moduleId,
    difficulty: q.difficulty,
    totalMarks: q.questions.reduce((s, x) => s + x.points, 0),
    passingMarks: q.passingMarks,
    timeLimitMinutes: q.timeLimitMinutes,
    maxAttempts: q.maxAttempts,
    startDate: q.startDate,
    endDate: q.endDate,
    questions,
  };
}

@Injectable()
export class QuizService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lessonAccess: LessonAccessService,
  ) {}

  /** A lesson's quiz follows the lesson's publish / access / drip rules. */
  private async assertLessonOpen(user: AuthUser, quiz: { lessonId: string }) {
    if (quiz.lessonId) await this.lessonAccess.assert(user.userId, user.role, quiz.lessonId, null);
  }

  /** Enrolled students only, unless the quiz is open to all students of the workspace. */
  private async assertAccess(user: AuthUser, quiz: Pick<QuizWithQuestions, "courseId" | "access" | "institutionId">) {
    if (user.role === "ADMIN") return;
    if (quiz.access === "ALL_STUDENTS" && (quiz.institutionId ?? null) === (user.institutionId ?? null)) return;
    const enrolled = await this.prisma.enrollment.findUnique({ where: { userId_courseId: { userId: user.userId, courseId: quiz.courseId } }, select: { id: true } });
    if (!enrolled) throw new ForbiddenException("Enroll in this course to take its quizzes.");
  }

  private async mustFindOpen(user: AuthUser, id: string) {
    const quiz = await this.prisma.quiz.findUnique({ where: { id }, include: withQuestions });
    if (!quiz || quiz.status !== "PUBLISHED") throw new NotFoundException("Quiz not found");
    await this.assertAccess(user, quiz);
    await this.assertLessonOpen(user, quiz);
    return quiz;
  }

  async listForCourse(user: AuthUser, courseId: string) {
    const now = new Date();
    const quizzes = await this.prisma.quiz.findMany({ where: { courseId, status: "PUBLISHED" }, include: withQuestions, orderBy: { createdAt: "asc" } });
    if (quizzes[0]) await this.assertAccess(user, quizzes[0]);
    // Quizzes of lessons the student can't open yet stay out of the list.
    const open = await Promise.all(quizzes.map(async (q) => !q.lessonId || !!(await this.lessonAccess.check(user.userId, user.role, q.lessonId, null))?.allowed));
    return quizzes.filter((q, i) => open[i] && !quizClosedReason(q, now)).map((q) => forStudent(toQuizItem(q)));
  }

  async forLesson(user: AuthUser, lessonId: string) {
    const quiz = await this.prisma.quiz.findFirst({ where: { lessonId, status: "PUBLISHED" }, include: withQuestions });
    if (!quiz) return null;
    await this.assertAccess(user, quiz);
    await this.assertLessonOpen(user, quiz);
    return forStudent(toQuizItem(quiz));
  }

  async take(user: AuthUser, id: string) {
    const quiz = await this.mustFindOpen(user, id);
    const closed = quizClosedReason(quiz);
    if (closed) throw new BadRequestException(closed);
    return forStudent(toQuizItem(quiz));
  }

  myAttempts(user: AuthUser, quizId: string) {
    return this.prisma.quizAttempt.findMany({
      where: { quizId, userId: user.userId },
      orderBy: { submittedAt: "desc" },
      select: { id: true, attemptNumber: true, score: true, totalMarks: true, percentage: true, passed: true, completed: true, timeTakenSeconds: true, submittedAt: true },
    });
  }

  async submit(user: AuthUser, quizId: string, dto: SubmitQuizDto) {
    const quiz = await this.mustFindOpen(user, quizId);
    const now = new Date();
    const prior = await this.prisma.quizAttempt.count({ where: { quizId, userId: user.userId } });
    const problem = quizClosedReason(quiz, now) ?? attemptLimitReason(quiz, prior);
    if (problem) throw new BadRequestException(problem);

    const item = toQuizItem(quiz);
    const missing = missingRequired(item.questions, dto.answers);
    if (missing) throw new BadRequestException(`Answer all required questions (${missing} left).`);

    const graded = gradeAttempt(item.questions, dto.answers, item.passingMarks);
    const timeTakenSeconds = Math.round(dto.timeTakenSeconds ?? graded.results.reduce((s, r) => s + r.timeSeconds, 0));
    const attempt = await this.prisma.quizAttempt.create({
      data: {
        quizId,
        userId: user.userId,
        answers: JSON.stringify(dto.answers),
        results: graded.results as any,
        score: graded.score,
        totalMarks: graded.totalMarks,
        percentage: graded.percentage,
        passed: graded.passed,
        parsed: true,
        completed: true,
        attemptNumber: prior + 1,
        timeTakenSeconds,
        startedAt: new Date(now.getTime() - timeTakenSeconds * 1000),
        submittedAt: now,
      },
    });

    const reveal = item.showImmediately;
    return {
      id: attempt.id,
      attemptNumber: attempt.attemptNumber,
      // Without "show results immediately" the student only learns that it was submitted.
      ...(reveal && {
        score: graded.score,
        totalMarks: graded.totalMarks,
        percentage: graded.percentage,
        passed: graded.passed,
        questions: item.questions.map((q) => ({
          questionId: q.id,
          correct: graded.results.find((r) => r.questionId === q.id)?.correct ?? false,
          ...(item.showCorrectAnswers && { correctOptionIds: q.correctOptionIds, acceptedAnswers: q.acceptedAnswers }),
          ...(item.showExplanation && { explanationHtml: q.explanationHtml }),
        })),
      }),
    };
  }
}
