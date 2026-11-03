import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { CreateQuizDto, UpdateQuizDto } from "./dto/quiz.dto";
import { attemptLimitReason, quizClosedReason, shuffled } from "./quiz-gate";
import { gradeAttempt, missingRequired } from "./quiz-grading";
import { attemptMetrics, quizListStats, scoreDistribution } from "./quiz-insights";
import { quizRuleErrors } from "./quiz-rules";
import { optionsOf, questionKind, toQuestion, toQuestionData, toQuizData, toQuizItem } from "./quiz.mapper";
import type { QuizAttempt, QuizFields, QuizQuestionItem } from "./quizzes.types";

const messages = (cls: any, body: object) =>
  validateSync(plainToInstance(cls, body), { whitelist: true }).flatMap(function flat(e): string[] {
    return [...Object.values(e.constraints ?? {}), ...(e.children ?? []).flatMap(flat)];
  });

const mc: QuizQuestionItem = {
  id: "q-1",
  kind: "MULTIPLE_CHOICE",
  questionHtml: "<p>What is useState for?</p>",
  options: [
    { id: "o1", text: "State" },
    { id: "o2", text: "Routing" },
  ],
  correctOptionIds: ["o1"],
  acceptedAnswers: [],
  explanationHtml: "",
  points: 5,
  timeLimitSeconds: null,
  required: true,
  shuffleOptions: false,
};
const ms: QuizQuestionItem = { ...mc, id: "q-2", kind: "MULTIPLE_SELECT", options: [...mc.options, { id: "o3", text: "Effects" }], correctOptionIds: ["o1", "o3"], points: 10 };
const sa: QuizQuestionItem = { ...mc, id: "q-3", kind: "SHORT_ANSWER", options: [], correctOptionIds: [], acceptedAnswers: ["Hook"], points: 5, required: false };

const fields = (over: Partial<QuizFields> = {}): QuizFields => ({
  title: "React basics",
  descriptionHtml: "<p>Check your React knowledge.</p>",
  instructionsHtml: "",
  courseId: "11111111-1111-4111-8111-111111111111",
  moduleId: "22222222-2222-4222-8222-222222222222",
  difficulty: "BEGINNER",
  questions: [mc, ms, sa],
  passingMarks: 12,
  timeLimitMinutes: 30,
  maxAttempts: "2",
  showCorrectAnswers: true,
  showExplanation: true,
  randomizeQuestions: false,
  randomizeOptions: false,
  startDate: "2026-11-01",
  endDate: "2026-11-30",
  access: "ENROLLED",
  requirePreviousLessons: false,
  showImmediately: true,
  ...over,
});

describe("quiz mapper", () => {
  it("reads first-version questions", () => {
    expect(questionKind("multiple-choice")).toBe("MULTIPLE_CHOICE");
    expect(questionKind("true-false")).toBe("TRUE_FALSE");
    expect(optionsOf('["A","B"]')).toEqual([
      { id: "o1", text: "A" },
      { id: "o2", text: "B" },
    ]);
    const q = toQuestion({ id: "x", quizId: "z", questionText: "Q?", questionType: "multiple-choice", options: '["??","?."]', correctAnswer: "?.", correctOptionIds: [], acceptedAnswers: [], marks: 10, explanation: null, order: 1, timeLimitSeconds: null, required: true, shuffleOptions: false });
    expect(q.correctOptionIds).toEqual(["o2"]);
  });

  it("round-trips quiz + questions; end date covers the whole day", () => {
    const f = fields();
    const data = toQuizData(f) as any;
    expect(data.totalMarks).toBe(20);
    expect(data.endsAt.toISOString()).toBe("2026-11-30T17:59:59.999Z");
    const questions = f.questions.map((q, i) => ({ ...toQuestionData(q, i + 1), id: q.id, quizId: "z" })) as any;
    const now = new Date();
    const item = toQuizItem({ ...data, id: "z", institutionId: null, lessonId: "", status: "DRAFT", createdById: null, createdByName: "Admin", createdAt: now, updatedAt: now, questions });
    expect(item.startDate).toBe("2026-11-01");
    expect(item.endDate).toBe("2026-11-30");
    expect(item.questions).toEqual(f.questions);
    expect(item.maxAttempts).toBe("2");
  });
});

describe("quiz rules", () => {
  it("accepts a valid quiz", () => expect(quizRuleErrors(fields())).toEqual([]));
  it("checks answers, totals and dates", () => {
    expect(quizRuleErrors(fields({ passingMarks: 21 }))).toEqual(["Passing marks can't exceed the total (20)"]);
    expect(quizRuleErrors(fields({ questions: [{ ...mc, correctOptionIds: ["o1", "o2"] }] }))).toContain("Question 1: Only one answer can be correct");
    expect(quizRuleErrors(fields({ questions: [{ ...mc, correctOptionIds: [] }], passingMarks: 1 }))).toEqual(["Question 1: Mark the correct answer"]);
    expect(quizRuleErrors(fields({ questions: [{ ...sa, acceptedAnswers: [] }], passingMarks: 1 }))).toEqual(["Question 1: Add at least one accepted answer"]);
    expect(quizRuleErrors(fields({ endDate: "2026-10-01" }))).toContain("End date must be after the start date");
  });
});

describe("quiz DTOs", () => {
  it("accepts the wizard payload", () => expect(messages(CreateQuizDto, { ...fields(), status: "DRAFT" })).toEqual([]));
  it("uses the panel's messages", () => {
    const errs = messages(CreateQuizDto, { ...fields(), title: "ab", maxAttempts: "11", questions: [{ ...mc, questionHtml: "<p></p>", points: 0 }] });
    expect(errs).toEqual(expect.arrayContaining(["Quiz title must be at least 3 characters", "Select the number of attempts", "Write the question", "At least 1 point"]));
  });
  it("lets PATCH archive", () => {
    expect(messages(UpdateQuizDto, { status: "ARCHIVED" })).toEqual([]);
    expect(messages(CreateQuizDto, { ...fields(), status: "ARCHIVED" })).not.toEqual([]);
  });
});

describe("quiz grading", () => {
  it("grades all-or-nothing per question", () => {
    const g = gradeAttempt(
      [mc, ms, sa],
      [
        { questionId: "q-1", optionIds: ["o1"], timeSeconds: 10 },
        { questionId: "q-2", optionIds: ["o1"] },
        { questionId: "q-3", text: "  hook " },
      ],
      12,
    );
    expect(g.score).toBe(10);
    expect(g.passed).toBe(false);
    expect(g.results.map((r) => r.correct)).toEqual([true, false, true]);
    expect(missingRequired([mc, ms, sa], [{ questionId: "q-1", optionIds: ["o1"] }])).toBe(1);
  });
});

describe("quiz gate", () => {
  const q = { status: "PUBLISHED", startsAt: new Date("2026-11-01T00:00:00Z"), endsAt: new Date("2026-11-30T00:00:00Z"), maxAttempts: 1 };
  it("checks window and attempts", () => {
    expect(quizClosedReason(q, new Date("2026-11-10"))).toBeNull();
    expect(quizClosedReason(q, new Date("2026-10-10"))).toBe("This quiz hasn't opened yet.");
    expect(quizClosedReason({ ...q, status: "DRAFT" })).toBe("This quiz isn't available.");
    expect(attemptLimitReason(q, 1)).toBe("You've used all 1 attempt for this quiz.");
  });
  it("shuffles deterministically with a seed", () => expect(shuffled([1, 2, 3], () => 0)).toEqual([2, 3, 1]));
});

describe("quiz insights", () => {
  const at = (score: number, passed: boolean): QuizAttempt => ({ id: "a", quizId: "z", student: { id: "s", name: "S", email: "e" }, attemptNumber: 1, score, totalMarks: 20, passed, completed: true, timeTakenSeconds: 300, submittedAt: new Date().toISOString(), answers: [] });
  it("computes metrics and distributions", () => {
    const m = attemptMetrics([at(20, true), at(5, false)]);
    expect(m).toMatchObject({ total: 2, passed: 1, passRate: 50, avgScore: 12.5, avgTimeSeconds: 300 });
    expect(scoreDistribution([at(20, true), at(5, false)], 20).at(-1)).toEqual({ label: "20", count: 1 });
    expect(quizListStats([{ status: "PUBLISHED", createdAt: new Date() }, { status: "DRAFT", createdAt: new Date(0) }])).toMatchObject({ total: 2, published: 1, drafts: 1, newThisMonth: 1 });
  });
});
