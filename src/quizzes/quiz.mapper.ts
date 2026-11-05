import type { Prisma, Quiz, QuizAttempt as AttemptRow, QuizEvent, QuizQuestion } from "../../generated/prisma";
import { sanitizeRichText } from "../common/html";
import { instantToLocal, localToInstant } from "../common/workspace-time";
import type {
  QuizActivity,
  QuizAnswerResult,
  QuizAttempt,
  QuizDifficulty,
  QuizAccess,
  QuizFields,
  QuizItem,
  QuizOption,
  QuizQuestionItem,
  QuizQuestionKind,
  QuizStatus,
} from "./quizzes.types";

/** DB rows ⇄ panel shapes. Pure. Handles first-version rows (string[] options, text correctAnswer, kebab-case types). */

const DAY_MS = 86_400_000;
const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const parseJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

/** "multiple-choice" / "MCQ" / "MULTIPLE_CHOICE" → MULTIPLE_CHOICE. */
export function questionKind(type: string): QuizQuestionKind {
  const t = type.toUpperCase().replace(/[-\s]/g, "_");
  if (t === "MULTIPLE_SELECT" || t === "MULTI_SELECT" || t === "CHECKBOX") return "MULTIPLE_SELECT";
  if (t === "TRUE_FALSE" || t === "BOOLEAN") return "TRUE_FALSE";
  if (t === "SHORT_ANSWER" || t === "TEXT" || t === "FILL_IN_THE_BLANK") return "SHORT_ANSWER";
  return "MULTIPLE_CHOICE";
}

/** Options column: new rows store [{ id, text }], legacy rows store ["text", …] (ids become o1, o2 …). */
export function optionsOf(raw: string): QuizOption[] {
  const parsed = parseJson(raw);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((o, i) =>
      typeof o === "string" ? { id: `o${i + 1}`, text: o } : o && typeof o === "object" ? { id: String((o as any).id ?? `o${i + 1}`), text: String((o as any).text ?? "") } : null,
    )
    .filter((o): o is QuizOption => o !== null);
}

export function toQuestion(q: QuizQuestion): QuizQuestionItem {
  const kind = questionKind(q.questionType);
  const options = kind === "SHORT_ANSWER" ? [] : optionsOf(q.options);
  let correctOptionIds = strings(q.correctOptionIds);
  let acceptedAnswers = strings(q.acceptedAnswers);
  // Legacy rows: the correct answer is the option's text.
  if (kind !== "SHORT_ANSWER" && correctOptionIds.length === 0 && q.correctAnswer)
    correctOptionIds = options.filter((o) => o.text.trim().toLowerCase() === q.correctAnswer.trim().toLowerCase()).map((o) => o.id);
  if (kind === "SHORT_ANSWER" && acceptedAnswers.length === 0 && q.correctAnswer) acceptedAnswers = [q.correctAnswer];
  return {
    id: q.id,
    kind,
    questionHtml: q.questionText,
    options,
    correctOptionIds,
    acceptedAnswers,
    explanationHtml: q.explanation ?? "",
    points: q.marks,
    timeLimitSeconds: q.timeLimitSeconds,
    required: q.required,
    shuffleOptions: q.shuffleOptions,
  };
}

export const attemptsFromColumn = (n: number | null) => (n === null ? "UNLIMITED" : String(n));
export const attemptsToColumn = (v: string) => (v === "UNLIMITED" ? null : Number(v));
export const totalMarksOf = (questions: Pick<QuizQuestionItem, "points">[]) => questions.reduce((s, q) => s + q.points, 0);

export type QuizWithQuestions = Quiz & { questions: QuizQuestion[] };

export function toQuizItem(q: QuizWithQuestions): QuizItem {
  return {
    id: q.id,
    title: q.title,
    descriptionHtml: q.description ?? "",
    instructionsHtml: q.instructionsHtml,
    courseId: q.courseId,
    moduleId: q.moduleId ?? "",
    lessonId: q.lessonId ?? "",
    difficulty: q.difficulty as QuizDifficulty,
    questions: [...q.questions].sort((a, b) => a.order - b.order).map(toQuestion),
    passingMarks: q.passingScore,
    timeLimitMinutes: q.timeLimitMinutes,
    maxAttempts: attemptsFromColumn(q.maxAttempts),
    showCorrectAnswers: q.showCorrectAnswers,
    showExplanation: q.showExplanation,
    randomizeQuestions: q.randomizeQuestions,
    randomizeOptions: q.randomizeOptions,
    startDate: instantToLocal(q.startsAt).date,
    endDate: instantToLocal(q.endsAt).date,
    access: q.access as QuizAccess,
    requirePreviousLessons: q.requirePreviousLessons,
    showImmediately: q.showImmediately,
    status: (["PUBLISHED", "DRAFT", "ARCHIVED"].includes(q.status) ? q.status : "PUBLISHED") as QuizStatus,
    createdBy: q.createdByName,
    createdAt: q.createdAt.toISOString(),
    updatedAt: q.updatedAt.toISOString(),
  };
}

/** Quiz columns (questions are written separately). HTML is sanitized; totalMarks follows the questions. */
export function toQuizData(f: QuizFields): Omit<Prisma.QuizUncheckedCreateInput, "institutionId" | "status"> {
  const start = localToInstant(f.startDate, "00:00");
  const endDayStart = localToInstant(f.endDate, "00:00");
  return {
    courseId: f.courseId,
    moduleId: f.moduleId || null,
    title: f.title.trim(),
    description: sanitizeRichText(f.descriptionHtml),
    instructionsHtml: sanitizeRichText(f.instructionsHtml),
    difficulty: f.difficulty,
    timeLimitMinutes: f.timeLimitMinutes,
    passingScore: f.passingMarks,
    totalMarks: totalMarksOf(f.questions),
    maxAttempts: attemptsToColumn(f.maxAttempts),
    showCorrectAnswers: f.showCorrectAnswers,
    showExplanation: f.showExplanation,
    randomizeQuestions: f.randomizeQuestions,
    randomizeOptions: f.randomizeOptions,
    startsAt: start,
    endsAt: endDayStart ? new Date(endDayStart.getTime() + DAY_MS - 1) : null,
    access: f.access,
    requirePreviousLessons: f.requirePreviousLessons,
    showImmediately: f.showImmediately,
  };
}

/** Question columns (without quizId / id). Options/answers that don't apply to the kind are dropped. */
export function toQuestionData(q: QuizQuestionItem, order: number) {
  const short = q.kind === "SHORT_ANSWER";
  const options = short ? [] : q.options.map((o) => ({ id: o.id, text: o.text.trim() }));
  const correctOptionIds = short ? [] : q.correctOptionIds.filter((id) => options.some((o) => o.id === id));
  const acceptedAnswers = short ? q.acceptedAnswers.map((a) => a.trim()).filter(Boolean) : [];
  return {
    questionText: sanitizeRichText(q.questionHtml),
    questionType: q.kind,
    options: JSON.stringify(options),
    correctOptionIds,
    acceptedAnswers,
    // Kept for first-version readers: text of the first correct option / first accepted answer.
    correctAnswer: short ? (acceptedAnswers[0] ?? "") : (options.find((o) => o.id === correctOptionIds[0])?.text ?? ""),
    marks: q.points,
    explanation: sanitizeRichText(q.explanationHtml) || null,
    order,
    timeLimitSeconds: q.timeLimitSeconds,
    required: q.required,
    shuffleOptions: q.shuffleOptions,
  };
}

export function fieldsOf(item: QuizItem): QuizFields {
  const { id: _i, status: _s, createdBy: _c, createdAt: _ca, updatedAt: _u, ...fields } = item;
  return fields;
}

export type AttemptWithStudent = AttemptRow & { user: { id: string; name: string; email: string } };

export function toAttempt(a: AttemptWithStudent, quiz: Pick<Quiz, "totalMarks" | "passingScore">): QuizAttempt {
  const results = (Array.isArray(a.results) ? a.results : []) as unknown as QuizAnswerResult[];
  const isLegacy = a.totalMarks === 0;
  return {
    id: a.id,
    quizId: a.quizId,
    student: { id: a.user.id, name: a.user.name, email: a.user.email },
    attemptNumber: a.attemptNumber,
    score: a.score,
    totalMarks: isLegacy ? quiz.totalMarks : a.totalMarks,
    passed: isLegacy ? a.score >= quiz.passingScore : a.passed,
    completed: a.completed,
    timeTakenSeconds: isLegacy ? Math.max(0, Math.round((a.submittedAt.getTime() - a.startedAt.getTime()) / 1000)) : a.timeTakenSeconds,
    submittedAt: a.submittedAt.toISOString(),
    answers: results.map((r) => ({ questionId: String(r.questionId), correct: r.correct === true, timeSeconds: Number(r.timeSeconds) || 0 })),
  };
}

export function toActivity(e: QuizEvent): QuizActivity {
  return { id: e.id, quizId: e.quizId, kind: e.kind, message: e.message, actor: e.actorName, at: e.createdAt.toISOString() };
}
