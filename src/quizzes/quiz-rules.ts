import type { QuizFields, QuizQuestionItem } from "./quizzes.types";
import { totalMarksOf } from "./quiz.mapper";

/**
 * Cross-field rules the DTO decorators can't express (copied from the panel's quizQuestionSchema /
 * quizWizardSchema superRefine). Run on the merged quiz so a PATCH can't leave it inconsistent.
 */
export function questionErrors(q: QuizQuestionItem, index: number): string[] {
  const at = `Question ${index + 1}: `;
  if (q.kind === "SHORT_ANSWER") return q.acceptedAnswers.some((a) => a.trim()) ? [] : [`${at}Add at least one accepted answer`];
  const errors: string[] = [];
  if (q.options.length < 2) errors.push(`${at}Add at least 2 options`);
  const texts = q.options.map((o) => o.text.trim().toLowerCase());
  if (new Set(texts).size !== texts.length) errors.push(`${at}Options must be unique`);
  if (new Set(q.options.map((o) => o.id)).size !== q.options.length) errors.push(`${at}Option ids must be unique`);
  const valid = q.correctOptionIds.filter((id) => q.options.some((o) => o.id === id));
  if (valid.length === 0) errors.push(`${at}Mark the correct answer`);
  if ((q.kind === "MULTIPLE_CHOICE" || q.kind === "TRUE_FALSE") && valid.length > 1) errors.push(`${at}Only one answer can be correct`);
  return errors;
}

export function quizRuleErrors(f: QuizFields): string[] {
  const errors = f.questions.flatMap(questionErrors);
  if (new Set(f.questions.map((q) => q.id)).size !== f.questions.length) errors.push("Question ids must be unique");
  const total = totalMarksOf(f.questions);
  if (total > 0 && f.passingMarks > total) errors.push(`Passing marks can't exceed the total (${total})`);
  if (f.startDate && f.endDate && f.endDate < f.startDate) errors.push("End date must be after the start date");
  return errors;
}

/** Publishing needs at least one question (drafts may be empty). */
export const publishErrors = (f: QuizFields) => (f.questions.length === 0 ? ["Add at least one question"] : []);
