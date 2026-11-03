/** Response shapes for the admin panel's Quizzes pages — field for field `lms-admin-panel/src/types/quiz.ts`. */

export type QuizStatus = "PUBLISHED" | "DRAFT" | "ARCHIVED";
export type QuizDifficulty = "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
export type QuizQuestionKind = "MULTIPLE_CHOICE" | "MULTIPLE_SELECT" | "TRUE_FALSE" | "SHORT_ANSWER";
export type QuizAccess = "ENROLLED" | "ALL_STUDENTS" | "SPECIFIC_GROUPS";
/** "UNLIMITED" or "1"…"10". */
export type QuizAttempts = string;

export interface QuizOption {
  id: string;
  text: string;
}

export interface QuizQuestionItem {
  id: string;
  kind: QuizQuestionKind;
  questionHtml: string;
  options: QuizOption[];
  correctOptionIds: string[];
  acceptedAnswers: string[];
  explanationHtml: string;
  points: number;
  timeLimitSeconds: number | null;
  required: boolean;
  shuffleOptions: boolean;
}

/** Everything the Create/Edit wizard owns (= panel `QuizFields`). */
export interface QuizFields {
  title: string;
  descriptionHtml: string;
  instructionsHtml: string;
  courseId: string;
  moduleId: string;
  difficulty: QuizDifficulty;
  questions: QuizQuestionItem[];
  passingMarks: number;
  timeLimitMinutes: number | null;
  maxAttempts: QuizAttempts;
  showCorrectAnswers: boolean;
  showExplanation: boolean;
  randomizeQuestions: boolean;
  randomizeOptions: boolean;
  /** "YYYY-MM-DD" (workspace day) or "". */
  startDate: string;
  endDate: string;
  access: QuizAccess;
  requirePreviousLessons: boolean;
  showImmediately: boolean;
}

export interface QuizItem extends QuizFields {
  id: string;
  status: QuizStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface AttemptSummary {
  total: number;
  passed: number;
  /** Average score (marks) of completed attempts; 0 when none. */
  avgScore: number;
}

export interface QuizListItem extends QuizItem {
  attemptSummary: AttemptSummary;
}

export interface QuizStudent {
  id: string;
  name: string;
  email: string;
}

export interface QuizAnswerResult {
  questionId: string;
  correct: boolean;
  timeSeconds: number;
}

export interface QuizAttempt {
  id: string;
  quizId: string;
  student: QuizStudent;
  attemptNumber: number;
  score: number;
  totalMarks: number;
  passed: boolean;
  completed: boolean;
  timeTakenSeconds: number;
  submittedAt: string;
  answers: QuizAnswerResult[];
}

export type QuizActivityKind =
  | "CREATED"
  | "UPDATED"
  | "PUBLISHED"
  | "UNPUBLISHED"
  | "ARCHIVED"
  | "QUESTION_ADDED"
  | "QUESTION_REMOVED"
  | "SETTINGS_CHANGED"
  | "DUPLICATED";

export interface QuizActivity {
  id: string;
  quizId: string;
  kind: QuizActivityKind;
  message: string;
  actor: string;
  at: string;
}

/** One answer as a student sends it. */
export interface StudentAnswer {
  questionId: string;
  optionIds?: string[];
  text?: string;
  timeSeconds?: number;
}
