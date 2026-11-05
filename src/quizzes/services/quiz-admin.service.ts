import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { Prisma, QuizEventKind } from "../../../generated/prisma";
import type { AuthUser } from "../../common/auth-user";
import { PrismaService } from "../../prisma/prisma.service";
import { publishErrors, quizRuleErrors } from "../quiz-rules";
import { fieldsOf, toQuestionData, toQuizData, toQuizItem } from "../quiz.mapper";
import { QUIZ_COPY_SUFFIX, QUIZ_LIMITS, QUIZ_SETTING_KEYS } from "../quizzes.constants";
import type { QuizFields, QuizItem, QuizQuestionItem, QuizStatus } from "../quizzes.types";
import type { CreateQuizDto, UpdateQuizDto } from "../dto/quiz.dto";
import { QuizzesQueryService, withQuestions } from "./quizzes-query.service";
import { findCourseInTenant, tenantOf } from "../../common/tenancy";

type Tx = Prisma.TransactionClient;
type Actor = AuthUser & { name: string };

const STATUS_EVENT: Record<QuizStatus, { kind: QuizEventKind; message: string }> = {
  PUBLISHED: { kind: "PUBLISHED", message: "published the quiz" },
  DRAFT: { kind: "UNPUBLISHED", message: "moved the quiz to drafts" },
  ARCHIVED: { kind: "ARCHIVED", message: "archived the quiz" },
};
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Write side of admin Quizzes. Every change is recorded in the quiz's Activity Log. */
@Injectable()
export class QuizAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly query: QuizzesQueryService,
  ) {}

  async create(user: AuthUser, dto: CreateQuizDto): Promise<QuizItem> {
    const actor = await this.actor(user);
    const { status = "PUBLISHED", lessonId, ...rest } = dto;
    if (lessonId) rest.moduleId = await this.lessonModule(lessonId, rest.courseId);
    const fields = this.normalize(rest);
    await this.assertValid(tenantOf(user), fields, status);
    const id = await this.prisma.$transaction(async (tx) => {
      const quiz = await tx.quiz.create({
        data: { ...toQuizData(fields), lessonId: lessonId ?? "", status, institutionId: actor.institutionId ?? null, createdById: actor.userId, createdByName: actor.name },
      });
      await this.writeQuestions(tx, quiz.id, fields.questions);
      await this.log(tx, quiz.id, actor, "CREATED", `created the quiz "${fields.title}" with ${plural(fields.questions.length, "question")}`);
      if (status === "PUBLISHED") await this.log(tx, quiz.id, actor, "PUBLISHED", STATUS_EVENT.PUBLISHED.message);
      return quiz.id;
    });
    return this.reload(id);
  }

  async update(user: AuthUser, id: string, dto: UpdateQuizDto): Promise<QuizItem> {
    const actor = await this.actor(user);
    const current = toQuizItem(await this.query.mustFind(actor, id));
    const { status, lessonId, ...patch } = dto;
    if (patch.courseId && patch.courseId !== current.courseId) throw new BadRequestException("A quiz can't be moved to another course.");
    // A lesson quiz follows its lesson's module (lessons can move between modules).
    const nextLessonId = lessonId ?? current.lessonId;
    if (nextLessonId) patch.moduleId = await this.lessonModule(nextLessonId, current.courseId, id);
    const merged = this.normalize({
      ...fieldsOf(current),
      ...patch,
      timeLimitMinutes: patch.timeLimitMinutes === undefined ? current.timeLimitMinutes : patch.timeLimitMinutes,
    } as QuizFields);
    const nextStatus = status ?? current.status;
    await this.assertValid(tenantOf(user), merged, nextStatus, { module: patch.moduleId !== undefined });

    await this.prisma.$transaction(async (tx) => {
      await tx.quiz.update({ where: { id }, data: { ...toQuizData(merged), ...(lessonId !== undefined && { lessonId }), status: nextStatus } });
      if (patch.questions) await this.writeQuestions(tx, id, merged.questions);

      if (status && status !== current.status) await this.log(tx, id, actor, STATUS_EVENT[status].kind, STATUS_EVENT[status].message);
      const changed = Object.keys(patch);
      if (changed.length) {
        const diff = merged.questions.length - current.questions.length;
        const settingsOnly = changed.every((k) => (QUIZ_SETTING_KEYS as readonly string[]).includes(k));
        if (diff > 0) await this.log(tx, id, actor, "QUESTION_ADDED", `added ${plural(diff, "question")}`);
        else if (diff < 0) await this.log(tx, id, actor, "QUESTION_REMOVED", `removed ${plural(-diff, "question")}`);
        else if (settingsOnly) await this.log(tx, id, actor, "SETTINGS_CHANGED", "changed the quiz settings");
        else await this.log(tx, id, actor, "UPDATED", "updated the quiz");
      }
    });
    return this.reload(id);
  }

  /** Copy as a DRAFT without attempts. */
  async duplicate(user: AuthUser, id: string): Promise<QuizItem> {
    const actor = await this.actor(user);
    const source = toQuizItem(await this.query.mustFind(actor, id));
    const fields = { ...fieldsOf(source), title: `${source.title}${QUIZ_COPY_SUFFIX}`.slice(0, QUIZ_LIMITS.titleMax) };
    const copyId = await this.prisma.$transaction(async (tx) => {
      const quiz = await tx.quiz.create({
        data: { ...toQuizData(fields), status: "DRAFT", institutionId: actor.institutionId ?? null, createdById: actor.userId, createdByName: actor.name },
      });
      // Fresh question ids: the copy must not share attempt statistics with the source.
      await this.writeQuestions(tx, quiz.id, fields.questions.map((q) => ({ ...q, id: `new-${q.id}` })));
      await this.log(tx, quiz.id, actor, "DUPLICATED", `duplicated from "${source.title}"`);
      return quiz.id;
    });
    return this.reload(copyId);
  }

  async remove(user: AuthUser, id: string): Promise<{ id: string }> {
    await this.query.mustFind(user, id);
    await this.prisma.quiz.delete({ where: { id } }); // questions, attempts and events cascade
    return { id };
  }

  // ---------------------------------------------------------------- helpers

  private async reload(id: string) {
    return toQuizItem(await this.prisma.quiz.findUniqueOrThrow({ where: { id }, include: withQuestions }));
  }

  private async actor(user: AuthUser): Promise<Actor> {
    const u = await this.prisma.user.findUnique({ where: { id: user.userId }, select: { name: true } });
    return { ...user, name: u?.name ?? "Admin" };
  }

  private log(tx: Tx, quizId: string, actor: Actor, kind: QuizEventKind, message: string) {
    return tx.quizEvent.create({ data: { quizId, kind, message, actorId: actor.userId, actorName: actor.name } });
  }

  /**
   * Replace the question list, keeping the ids of questions that already belong to this quiz (so attempt
   * statistics stay attached). Client ids ("q-abc…") become new UUIDs.
   */
  private async writeQuestions(tx: Tx, quizId: string, questions: QuizQuestionItem[]) {
    const existing = new Set((await tx.quizQuestion.findMany({ where: { quizId }, select: { id: true } })).map((q) => q.id));
    const keep = questions.filter((q) => existing.has(q.id)).map((q) => q.id);
    await tx.quizQuestion.deleteMany({ where: { quizId, id: { notIn: keep } } });
    for (const [i, q] of questions.entries()) {
      const data = toQuestionData(q, i + 1);
      if (existing.has(q.id)) await tx.quizQuestion.update({ where: { id: q.id }, data });
      else await tx.quizQuestion.create({ data: { ...data, id: randomUUID(), quizId } });
    }
  }

  private normalize(f: QuizFields): QuizFields {
    return { ...f, timeLimitMinutes: f.timeLimitMinutes ?? null };
  }

  /** Module of a lesson of `courseId` that has no other quiz yet (one quiz per lesson). */
  private async lessonModule(lessonId: string, courseId: string, quizId?: string): Promise<string> {
    const lesson = await this.prisma.lesson.findFirst({ where: { id: lessonId, courseId }, select: { moduleId: true } });
    if (!lesson) throw new BadRequestException("Select a lesson from this course");
    const other = await this.prisma.quiz.findFirst({ where: { lessonId, ...(quizId && { id: { not: quizId } }) }, select: { id: true } });
    if (other) throw new ConflictException("This lesson already has a quiz. Edit that one instead.");
    return lesson.moduleId;
  }

  private async assertValid(tenantId: string | null, f: QuizFields, status: QuizStatus, check = { module: true }) {
    const errors = [...quizRuleErrors(f), ...(status === "PUBLISHED" ? publishErrors(f) : [])];
    if (errors.length) throw new BadRequestException(errors);
    await findCourseInTenant(this.prisma, tenantId, f.courseId, { id: true });
    if (check.module && f.moduleId) {
      const mod = await this.prisma.courseModule.findFirst({ where: { id: f.moduleId, courseId: f.courseId }, select: { id: true } });
      if (!mod) throw new BadRequestException("Select a module from this course");
    }
  }
}
