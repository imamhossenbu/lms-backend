import { localToInstant } from "../common/workspace-time";
import type { AssignmentFields, AssignmentRubric } from "./assignments.types";

/**
 * Cross-field rules the DTO decorators can't express (copied from the panel's assignmentWizardSchema /
 * rubricSchema superRefine). They run on the merged assignment, so a PATCH can't leave it inconsistent.
 * Returns user-facing messages; empty = valid.
 */
export function assignmentRuleErrors(f: AssignmentFields): string[] {
  const errors: string[] = [];

  if (f.type === "FILE_UPLOAD" && f.instructions.allowedFileTypes.length === 0) errors.push("Allow at least one file type");

  if (f.lateSubmission === "ALLOW_WITH_PENALTY") {
    if (f.latePenalty <= 0) errors.push("Enter a penalty greater than 0");
    if (f.latePenaltyUnit === "PERCENT" && f.latePenalty > 100) errors.push("Percentage can't exceed 100");
    if (f.latePenaltyUnit === "POINTS" && f.latePenalty > f.totalPoints) errors.push("Penalty can't exceed the total points");
  }

  if (f.passingScore !== null && f.passingScore > f.totalPoints) errors.push(`Passing score can't exceed ${f.totalPoints}`);
  if (f.aiGrading.enabled && f.aiGrading.criteria.trim().length < 10) errors.push("Describe what the AI should evaluate (at least 10 characters)");

  errors.push(...rubricErrors(f.rubric, f.totalPoints));

  const release = localToInstant(f.releaseDate, f.releaseTime);
  const due = localToInstant(f.dueDate, f.dueTime);
  if (release && due && due <= release) errors.push("Due date must be after the release date");

  if (f.availability === "WINDOW") {
    const start = localToInstant(f.windowStartDate, f.windowStartTime);
    const end = localToInstant(f.windowEndDate, f.windowEndTime);
    if (!start) errors.push("Pick the window start");
    if (!end) errors.push("Pick the window end");
    if (start && end && end <= start) errors.push("Window end must be after the start");
  }
  return errors;
}

export function rubricErrors(r: AssignmentRubric, totalPoints: number): string[] {
  if (!r.enabled) return [];
  const errors: string[] = [];
  if (r.title.trim().length < 3) errors.push("Rubric title must be at least 3 characters");
  if (r.criteria.length === 0) errors.push("Add at least one criterion");
  for (const c of r.criteria) {
    const top = Math.max(...c.levels.map((l) => l.points));
    if (top !== c.points) errors.push(`"${c.title}": highest level (${top} pts) must equal the criterion points`);
    if (new Set(c.levels.map((l) => l.id)).size !== c.levels.length) errors.push(`"${c.title}": level ids must be unique`);
  }
  if (new Set(r.criteria.map((c) => c.id)).size !== r.criteria.length) errors.push("Criterion ids must be unique");
  const sum = r.criteria.reduce((s, c) => s + c.points, 0);
  if (r.criteria.length && sum !== totalPoints) errors.push(`Criteria add up to ${sum} points — they must equal the total points (${totalPoints})`);
  return errors;
}

/** Grade modal: score within [0, total]; per-criterion points known and within each criterion's max. */
export function gradeErrors(score: number, totalPoints: number, criterionScores: Record<string, number> | undefined, rubric: AssignmentRubric): string[] {
  const errors: string[] = [];
  if (score > totalPoints) errors.push(`Score can't exceed ${totalPoints}`);
  for (const [id, points] of Object.entries(criterionScores ?? {})) {
    const c = rubric.criteria.find((x) => x.id === id);
    if (!c) errors.push(`Unknown rubric criterion "${id}"`);
    else if (typeof points !== "number" || !Number.isFinite(points) || points < 0 || points > c.points) errors.push(`"${c.title}" must be between 0 and ${c.points}`);
  }
  return errors;
}

