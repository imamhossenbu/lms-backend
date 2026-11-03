import type { Assignment, AssignmentSubmission as SubmissionRow, Prisma } from "../../generated/prisma";
import { sanitizeRichText } from "../common/html";
import { instantToLocal, localToInstant } from "../common/workspace-time";
import type {
  AssignmentAttachment,
  AssignmentFields,
  AssignmentInstructions,
  AssignmentItem,
  AssignmentRubric,
  AssignmentStatus,
  AssignmentSubmission,
  EstimatedUnit,
  GradeDisplay,
  PenaltyUnit,
} from "./assignments.types";

/** DB row ⇄ panel shape. Pure functions — no Prisma client here. */

const asObject = (v: Prisma.JsonValue): Record<string, any> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, any>) : {});
const asArray = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const strings = (v: unknown) => asArray<unknown>(v).filter((x): x is string => typeof x === "string");

/** "pdf,zip" ⇄ [".pdf", ".zip"] (the legacy column has no dots). */
export const fileTypesFromColumn = (csv: string) =>
  csv
    .split(",")
    .map((t) => t.trim().toLowerCase().replace(/^\.+/, ""))
    .filter(Boolean)
    .map((t) => `.${t}`);
export const fileTypesToColumn = (types: string[]) => types.map((t) => t.replace(/^\.+/, "").toLowerCase()).join(",");

export const attemptsFromColumn = (maxAttempts: number | null) => (maxAttempts === null ? "UNLIMITED" : String(maxAttempts));
export const attemptsToColumn = (attempts: string) => (attempts === "UNLIMITED" ? null : Number(attempts));

export function instructionsOf(a: Pick<Assignment, "instructions" | "allowedFileTypes" | "maxFileSizeMb">): AssignmentInstructions {
  const i = asObject(a.instructions);
  return {
    overview: typeof i.overview === "string" ? i.overview : "",
    objectives: strings(i.objectives),
    tasks: strings(i.tasks),
    requirements: strings(i.requirements),
    allowedFileTypes: fileTypesFromColumn(a.allowedFileTypes),
    maxFileSizeMb: a.maxFileSizeMb,
    gradingNotes: strings(i.gradingNotes),
  };
}

export function rubricOf(a: Pick<Assignment, "rubric" | "marks">): AssignmentRubric {
  const r = asObject(a.rubric);
  return {
    enabled: r.enabled === true,
    title: typeof r.title === "string" ? r.title : "",
    totalPoints: a.marks,
    description: typeof r.description === "string" ? r.description : "",
    visibleToStudents: r.visibleToStudents !== false,
    criteria: asArray(r.criteria),
  };
}

export function toAssignmentItem(a: Assignment, enrolledCount: number): AssignmentItem {
  const due = instantToLocal(a.dueDate);
  const release = instantToLocal(a.releaseAt);
  const windowStart = instantToLocal(a.windowStartAt);
  const windowEnd = instantToLocal(a.windowEndAt);
  return {
    id: a.id,
    courseId: a.courseId,
    title: a.title,
    descriptionHtml: a.description ?? "",
    moduleId: a.moduleId ?? "",
    lessonId: a.lessonId,
    type: a.type,
    dueDate: due.date,
    dueTime: due.time,
    totalPoints: a.marks,
    attempts: attemptsFromColumn(a.maxAttempts),
    lateSubmission: a.lateSubmission,
    gradingType: a.gradingType,
    showRubric: a.showRubric,
    peerReview: a.peerReview,
    status: (a.status === "DRAFT" ? "DRAFT" : "PUBLISHED") as AssignmentStatus,
    attachments: asArray<AssignmentAttachment>(a.attachments),
    instructions: instructionsOf(a),
    rubric: rubricOf(a),
    enrolledCount,
    category: a.category,
    difficulty: a.difficulty,
    estimatedTime: a.estimatedTime,
    estimatedUnit: a.estimatedUnit as EstimatedUnit,
    instructionsHtml: a.instructionsHtml,
    maxFiles: a.maxFiles,
    latePenalty: a.latePenalty,
    latePenaltyUnit: a.latePenaltyUnit as PenaltyUnit,
    passingScore: a.passingScore,
    gradeDisplay: a.gradeDisplay as GradeDisplay,
    aiGrading: { enabled: a.aiGradingEnabled, criteria: a.aiGradingCriteria },
    manualOverride: a.manualOverride,
    // Legacy rows have no release moment: they were visible from creation.
    releaseDate: release.date || instantToLocal(a.createdAt).date,
    releaseTime: release.time || instantToLocal(a.createdAt).time,
    availability: a.availability,
    timeLimitMinutes: a.timeLimitMinutes,
    windowStartDate: windowStart.date,
    windowStartTime: windowStart.time,
    windowEndDate: windowEnd.date,
    windowEndTime: windowEnd.time,
    showInCalendar: a.showInCalendar,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

/** Panel fields → columns. HTML is sanitized; the rubric's total always follows the assignment's points. */
export function toAssignmentData(f: AssignmentFields): Omit<Prisma.AssignmentUncheckedCreateInput, "institutionId" | "status"> {
  return {
    courseId: f.courseId,
    moduleId: f.moduleId || null,
    lessonId: f.lessonId,
    title: f.title.trim(),
    description: sanitizeRichText(f.descriptionHtml),
    dueDate: localToInstant(f.dueDate, f.dueTime)!,
    marks: f.totalPoints,
    allowedFileTypes: fileTypesToColumn(f.instructions.allowedFileTypes),
    type: f.type,
    category: f.category,
    difficulty: f.difficulty,
    estimatedTime: f.estimatedTime,
    estimatedUnit: f.estimatedUnit,
    instructionsHtml: sanitizeRichText(f.instructionsHtml),
    instructions: {
      overview: f.instructions.overview,
      objectives: f.instructions.objectives,
      tasks: f.instructions.tasks,
      requirements: f.instructions.requirements,
      gradingNotes: f.instructions.gradingNotes,
    },
    attachments: f.attachments.map((x) => ({ id: x.id, name: x.name, url: x.url, size: x.size, format: x.format.toUpperCase() })),
    rubric: {
      enabled: f.rubric.enabled,
      title: f.rubric.title,
      description: f.rubric.description,
      visibleToStudents: f.rubric.visibleToStudents,
      criteria: f.rubric.criteria.map((c) => ({
        id: c.id,
        title: c.title,
        description: c.description,
        points: c.points,
        levels: c.levels.map((l) => ({ id: l.id, tone: l.tone, label: l.label, points: l.points, description: l.description })),
      })),
    } as unknown as Prisma.InputJsonValue,
    maxFiles: f.maxFiles,
    maxFileSizeMb: f.instructions.maxFileSizeMb,
    maxAttempts: attemptsToColumn(f.attempts),
    lateSubmission: f.lateSubmission,
    latePenalty: f.lateSubmission === "ALLOW_WITH_PENALTY" ? f.latePenalty : 0,
    latePenaltyUnit: f.latePenaltyUnit,
    gradingType: f.gradingType,
    passingScore: f.passingScore,
    gradeDisplay: f.gradeDisplay,
    showRubric: f.showRubric,
    peerReview: f.peerReview,
    aiGradingEnabled: f.aiGrading.enabled,
    aiGradingCriteria: f.aiGrading.enabled ? f.aiGrading.criteria.trim() : "",
    manualOverride: f.manualOverride,
    releaseAt: localToInstant(f.releaseDate, f.releaseTime),
    availability: f.availability,
    timeLimitMinutes: f.timeLimitMinutes,
    windowStartAt: f.availability === "WINDOW" ? localToInstant(f.windowStartDate, f.windowStartTime) : null,
    windowEndAt: f.availability === "WINDOW" ? localToInstant(f.windowEndDate, f.windowEndTime) : null,
    showInCalendar: f.showInCalendar,
  };
}

/** Only the wizard-owned keys of an item (drops id, status, counts, timestamps). */
export function fieldsOf(item: AssignmentItem): AssignmentFields {
  const { id: _id, status: _status, enrolledCount: _enrolled, createdAt: _c, updatedAt: _u, ...fields } = item;
  return fields;
}

export type SubmissionWithStudent = SubmissionRow & { user: { id: string; name: string; email: string } };

export function toSubmission(s: SubmissionWithStudent): AssignmentSubmission {
  const scores = asObject(s.criterionScores);
  return {
    id: s.id,
    assignmentId: s.assignmentId,
    student: { id: s.user.id, name: s.user.name, email: s.user.email, group: "" },
    submittedAt: s.submittedAt.toISOString(),
    status: s.status === "GRADED" ? "GRADED" : "PENDING",
    isLate: s.isLate,
    score: s.marksObtained,
    criterionScores: Object.fromEntries(Object.entries(scores).filter(([, v]) => typeof v === "number")) as Record<string, number>,
    timeTakenMinutes: s.timeTakenMinutes,
    feedback: s.feedback ?? "",
    fileName: s.fileName,
    fileUrl: s.fileUrl,
    textAnswer: s.textAnswer ?? "",
    attempt: s.attempt,
    gradedAt: s.gradedAt?.toISOString() ?? null,
  };
}
