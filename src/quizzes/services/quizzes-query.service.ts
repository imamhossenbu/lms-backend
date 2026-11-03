import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "../../../generated/prisma";
import type { AuthUser } from "../../common/auth-user";
import { paginated, skipTake, type Paginated } from "../../common/pagination";
import { PrismaService } from "../../prisma/prisma.service";
import { quizInsights, quizListStats } from "../quiz-insights";
import { toActivity, toAttempt, toQuizItem } from "../quiz.mapper";
import type { AttemptSummary, QuizActivity, QuizAttempt, QuizItem, QuizListItem } from "../quizzes.types";
import type { AttemptQueryDto } from "../dto/attempt.dto";
import type { QuizQueryDto, QuizStatsQueryDto } from "../dto/quiz.dto";
import type { PaginationQueryDto } from "../../common/pagination";

export const withQuestions = { questions: { orderBy: { order: "asc" as const } } } satisfies Prisma.QuizInclude;
export const attemptInclude = { user: { select: { id: true, name: true, email: true } } } satisfies Prisma.QuizAttemptInclude;

/** Read side of admin Quizzes: list, stats, details, attempts, analytics, activity log. */
@Injectable()
export class QuizzesQueryService {
  constructor(private readonly prisma: PrismaService) {}

  scope(actor: AuthUser): Prisma.QuizWhereInput {
    return { institutionId: actor.institutionId ?? null };
  }

  async mustFind(actor: AuthUser, id: string) {
    const row = await this.prisma.quiz.findFirst({ where: { id, ...this.scope(actor) }, include: withQuestions });
    if (!row) throw new NotFoundException("This quiz no longer exists.");
    return row;
  }

  async list(actor: AuthUser, q: QuizQueryDto): Promise<Paginated<QuizListItem>> {
    const where: Prisma.QuizWhereInput = {
      ...this.scope(actor),
      ...(q.courseId && { courseId: q.courseId }),
      ...(q.moduleId && { moduleId: q.moduleId }),
      ...(q.status && { status: q.status }),
      ...(q.difficulty && { difficulty: q.difficulty }),
      ...(q.q && { title: { contains: q.q, mode: "insensitive" as const } }),
    };
    const [rows, total] = await Promise.all([
      this.prisma.quiz.findMany({ where, include: withQuestions, orderBy: [{ [q.sortBy]: q.sortOrder }, { id: "asc" }], ...skipTake(q) }),
      this.prisma.quiz.count({ where }),
    ]);
    const summaries = await this.attemptSummaries(rows);
    return paginated(
      rows.map((r) => ({ ...toQuizItem(r), attemptSummary: summaries.get(r.id) ?? { total: 0, passed: 0, avgScore: 0 } })),
      total,
      q,
    );
  }

  /** Attempts per quiz, passed count and average score (completed attempts). */
  private async attemptSummaries(quizzes: { id: string; passingScore: number }[]): Promise<Map<string, AttemptSummary>> {
    if (!quizzes.length) return new Map();
    const passing = new Map(quizzes.map((q) => [q.id, q.passingScore]));
    const rows = await this.prisma.quizAttempt.findMany({
      where: { quizId: { in: quizzes.map((q) => q.id) } },
      select: { quizId: true, score: true, passed: true, completed: true, totalMarks: true },
    });
    const map = new Map<string, AttemptSummary & { sum: number; done: number }>();
    for (const r of rows) {
      const s = map.get(r.quizId) ?? { total: 0, passed: 0, avgScore: 0, sum: 0, done: 0 };
      s.total += 1;
      // Legacy attempts (totalMarks 0) have no stored verdict — compare with the passing marks.
      if (r.totalMarks === 0 ? r.score >= (passing.get(r.quizId) ?? Infinity) : r.passed) s.passed += 1;
      if (r.completed) {
        s.sum += r.score;
        s.done += 1;
      }
      map.set(r.quizId, s);
    }
    return new Map([...map].map(([id, s]) => [id, { total: s.total, passed: s.passed, avgScore: s.done ? Math.round((s.sum / s.done) * 10) / 10 : 0 }]));
  }

  /** "Quizzes" stat cards (one course or the whole workspace). */
  async stats(actor: AuthUser, q: QuizStatsQueryDto) {
    const rows = await this.prisma.quiz.findMany({ where: { ...this.scope(actor), ...(q.courseId && { courseId: q.courseId }) }, select: { status: true, createdAt: true } });
    return quizListStats(rows);
  }

  async detail(actor: AuthUser, id: string): Promise<QuizItem> {
    return toQuizItem(await this.mustFind(actor, id));
  }

  async attempts(actor: AuthUser, id: string, q: AttemptQueryDto): Promise<Paginated<QuizAttempt>> {
    const quiz = await this.mustFind(actor, id);
    const where: Prisma.QuizAttemptWhereInput = {
      quizId: id,
      ...(q.passed !== undefined && { passed: q.passed }),
      ...(q.completed !== undefined && { completed: q.completed }),
      ...(q.q && {
        user: { OR: [{ name: { contains: q.q, mode: "insensitive" as const } }, { email: { contains: q.q, mode: "insensitive" as const } }] },
      }),
    };
    const [rows, total] = await Promise.all([
      this.prisma.quizAttempt.findMany({ where, include: attemptInclude, orderBy: [{ [q.sortBy]: q.sortOrder }, { id: "asc" }], ...skipTake(q) }),
      this.prisma.quizAttempt.count({ where }),
    ]);
    return paginated(
      rows.map((r) => toAttempt(r, quiz)),
      total,
      q,
    );
  }

  /** Overview / Analytics / Submissions tabs: metrics, trends, charts and insight sentences over all attempts. */
  async insights(actor: AuthUser, id: string) {
    const quiz = await this.mustFind(actor, id);
    const rows = await this.prisma.quizAttempt.findMany({ where: { quizId: id }, include: attemptInclude });
    return quizInsights(
      toQuizItem(quiz),
      rows.map((r) => toAttempt(r, quiz)),
    );
  }

  async activity(actor: AuthUser, id: string, q: PaginationQueryDto): Promise<Paginated<QuizActivity>> {
    await this.mustFind(actor, id);
    const [rows, total] = await Promise.all([
      this.prisma.quizEvent.findMany({ where: { quizId: id }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], ...skipTake(q) }),
      this.prisma.quizEvent.count({ where: { quizId: id } }),
    ]);
    return paginated(rows.map(toActivity), total, q);
  }
}
