/** Enum values + limits shared by DTOs, rules and mapper (copied from the panel's quizWizardSchema). */

export const QUIZ_STATUSES = ["PUBLISHED", "DRAFT", "ARCHIVED"] as const;
export const QUIZ_DIFFICULTIES = ["BEGINNER", "INTERMEDIATE", "ADVANCED"] as const;
export const QUESTION_KINDS = ["MULTIPLE_CHOICE", "MULTIPLE_SELECT", "TRUE_FALSE", "SHORT_ANSWER"] as const;
export const QUIZ_ACCESS = ["ENROLLED", "ALL_STUDENTS", "SPECIFIC_GROUPS"] as const;

export const QUIZ_LIMITS = {
  titleMax: 120,
  descriptionMin: 10,
  descriptionMax: 1000,
  instructionsMax: 1000,
  questionMin: 3,
  questionMax: 500,
  explanationMax: 500,
  questionsMax: 100,
  optionsMax: 8,
  optionMax: 200,
  acceptedMax: 10,
  pointsMax: 100,
  timeLimitMinutesMax: 600,
} as const;

/** Settings-step keys: a PATCH touching only these is logged as SETTINGS_CHANGED. */
export const QUIZ_SETTING_KEYS = [
  "passingMarks",
  "timeLimitMinutes",
  "maxAttempts",
  "showCorrectAnswers",
  "showExplanation",
  "randomizeQuestions",
  "randomizeOptions",
  "startDate",
  "endDate",
  "access",
  "requirePreviousLessons",
  "showImmediately",
] as const;

export const QUIZ_COPY_SUFFIX = " (Copy)";
