/**
 * Response shapes for the admin panel's Assignments pages — they mirror `lms-admin-panel/src/types/assignment.ts`
 * field for field, so the panel can swap its localStorage mock for these endpoints without mapping.
 */

export type AssignmentType = "FILE_UPLOAD" | "TEXT" | "LINK";
export type AssignmentStatus = "PUBLISHED" | "DRAFT";
export type GradingType = "POINTS" | "PASS_FAIL" | "LETTER" | "NOT_GRADED";
export type LateSubmissionPolicy = "ALLOW" | "ALLOW_WITH_PENALTY" | "DISALLOW";
/** "UNLIMITED" or a max number of attempts as a string ("1" = single attempt). */
export type AttemptsOption = string;
export type AssignmentDifficulty = "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
export type GradeDisplay = "EXACT" | "GRADE_ONLY";
export type AvailabilityMode = "UNTIL_DUE" | "TIME_LIMIT" | "WINDOW";
export type PenaltyUnit = "PERCENT" | "POINTS";
export type EstimatedUnit = "MINUTES" | "HOURS";
export type RubricLevelTone = "EXCELLENT" | "GOOD" | "NEEDS_IMPROVEMENT";
export type SubmissionStatus = "GRADED" | "PENDING";

export interface AssignmentAttachment {
  id: string;
  name: string;
  url: string;
  /** Bytes. */
  size: number;
  /** Upper-case extension, e.g. "PDF". */
  format: string;
}

export interface RubricLevel {
  id: string;
  tone: RubricLevelTone;
  label: string;
  points: number;
  description: string;
}

export interface RubricCriterion {
  id: string;
  title: string;
  description: string;
  points: number;
  levels: RubricLevel[];
}

export interface AssignmentRubric {
  enabled: boolean;
  title: string;
  totalPoints: number;
  description: string;
  visibleToStudents: boolean;
  criteria: RubricCriterion[];
}

export interface AssignmentInstructions {
  overview: string;
  objectives: string[];
  tasks: string[];
  requirements: string[];
  /** Extensions incl. dot, e.g. ".html". */
  allowedFileTypes: string[];
  maxFileSizeMb: number;
  gradingNotes: string[];
}

/** Everything the Create/Edit wizard owns (= panel `WizardAssignmentFields`). */
export interface AssignmentFields {
  courseId: string;
  title: string;
  descriptionHtml: string;
  moduleId: string;
  lessonId: string;
  type: AssignmentType;
  /** "YYYY-MM-DD" in the workspace timezone. */
  dueDate: string;
  /** "HH:mm". */
  dueTime: string;
  totalPoints: number;
  attempts: AttemptsOption;
  lateSubmission: LateSubmissionPolicy;
  gradingType: GradingType;
  showRubric: boolean;
  peerReview: boolean;
  attachments: AssignmentAttachment[];
  instructions: AssignmentInstructions;
  rubric: AssignmentRubric;
  category: string;
  difficulty: AssignmentDifficulty;
  estimatedTime: number;
  estimatedUnit: EstimatedUnit;
  instructionsHtml: string;
  maxFiles: number;
  latePenalty: number;
  latePenaltyUnit: PenaltyUnit;
  passingScore: number | null;
  gradeDisplay: GradeDisplay;
  aiGrading: { enabled: boolean; criteria: string };
  manualOverride: boolean;
  releaseDate: string;
  releaseTime: string;
  availability: AvailabilityMode;
  timeLimitMinutes: number;
  windowStartDate: string;
  windowStartTime: string;
  windowEndDate: string;
  windowEndTime: string;
  showInCalendar: boolean;
}

export interface AssignmentItem extends AssignmentFields {
  id: string;
  status: AssignmentStatus;
  /** Students enrolled in the course (denominator for "28 / 32"). */
  enrolledCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SubmissionCounts {
  total: number;
  graded: number;
  pending: number;
  late: number;
}

/** Row of the Assignments list (item + its submission counters). */
export interface AssignmentListItem extends AssignmentItem {
  submissionCounts: SubmissionCounts;
}

export interface AssignmentStudent {
  id: string;
  name: string;
  email: string;
  /** Cohort label for the "All Groups" filter. Groups aren't modelled yet, so this is "". */
  group: string;
}

export interface AssignmentSubmission {
  id: string;
  assignmentId: string;
  student: AssignmentStudent;
  submittedAt: string;
  status: SubmissionStatus;
  isLate: boolean;
  score: number | null;
  criterionScores: Record<string, number>;
  timeTakenMinutes: number | null;
  feedback: string;
  fileName: string;
  /** Uploaded file URL (FILE_UPLOAD); null otherwise. */
  fileUrl: string | null;
  textAnswer: string;
  attempt: number;
  gradedAt: string | null;
}

export interface CourseAssignmentStats {
  totalAssignments: number;
  totalSubmissions: number;
  pendingReview: number;
  graded: number;
}
