import type { QuizAnswerResult, QuizQuestionItem, StudentAnswer } from "./quizzes.types";

/** Auto-grading. All-or-nothing per question. Pure. */

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

export function isCorrect(q: QuizQuestionItem, a: StudentAnswer | undefined): boolean {
  if (!a) return false;
  if (q.kind === "SHORT_ANSWER") return !!a.text && q.acceptedAnswers.some((x) => norm(x) === norm(a.text!));
  const picked = new Set(a.optionIds ?? []);
  const correct = new Set(q.correctOptionIds);
  if (picked.size !== correct.size) return false;
  return [...correct].every((id) => picked.has(id));
}

export function gradeAttempt(questions: QuizQuestionItem[], answers: StudentAnswer[], passingMarks: number) {
  const byId = new Map(answers.map((a) => [a.questionId, a]));
  const results: QuizAnswerResult[] = [];
  let score = 0;
  for (const q of questions) {
    const a = byId.get(q.id);
    if (!a) continue; // unanswered questions don't count towards per-question stats
    const correct = isCorrect(q, a);
    if (correct) score += q.points;
    results.push({ questionId: q.id, correct, timeSeconds: Math.max(0, Math.round(a.timeSeconds ?? 0)) });
  }
  const totalMarks = questions.reduce((s, q) => s + q.points, 0);
  return { score, totalMarks, passed: score >= passingMarks, percentage: totalMarks ? Math.round((score / totalMarks) * 10000) / 100 : 0, results };
}

/** Required questions the student skipped. */
export const missingRequired = (questions: QuizQuestionItem[], answers: StudentAnswer[]) => {
  const answered = new Set(answers.filter((a) => (a.optionIds?.length ?? 0) > 0 || a.text?.trim()).map((a) => a.questionId));
  return questions.filter((q) => q.required && !answered.has(q.id)).length;
};
