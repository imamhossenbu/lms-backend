/** Enum values + limits shared by the DTOs, rules and mapper (copied from the panel's zod schemas). */

export const ASSIGNMENT_TYPES = ["FILE_UPLOAD", "TEXT", "LINK"] as const;
export const ASSIGNMENT_STATUSES = ["PUBLISHED", "DRAFT"] as const;
export const GRADING_TYPES = ["POINTS", "PASS_FAIL", "LETTER", "NOT_GRADED"] as const;
export const LATE_POLICIES = ["ALLOW", "ALLOW_WITH_PENALTY", "DISALLOW"] as const;
export const DIFFICULTIES = ["BEGINNER", "INTERMEDIATE", "ADVANCED"] as const;
export const GRADE_DISPLAYS = ["EXACT", "GRADE_ONLY"] as const;
export const AVAILABILITY_MODES = ["UNTIL_DUE", "TIME_LIMIT", "WINDOW"] as const;
export const PENALTY_UNITS = ["PERCENT", "POINTS"] as const;
export const ESTIMATED_UNITS = ["MINUTES", "HOURS"] as const;
export const RUBRIC_TONES = ["EXCELLENT", "GOOD", "NEEDS_IMPROVEMENT"] as const;
export const SUBMISSION_STATUSES = ["GRADED", "PENDING"] as const;

export const LIMITS = {
  titleMax: 200,
  shortDescriptionMin: 10,
  shortDescriptionMax: 500,
  instructionsMin: 20,
  instructionsMax: 5000,
  aiCriteriaMax: 500,
  rubricTitleMax: 100,
  rubricDescriptionMax: 500,
  feedbackMax: 1000,
  maxAttachments: 10,
  maxFileTypes: 20,
  maxCriteria: 12,
  maxPoints: 1000,
  maxAttempts: 10,
} as const;

/**
 * The panel sends local dates ("YYYY-MM-DD" + "HH:mm"). Until workspace Settings carry a timezone, they are read
 * in Bangladesh time — the platform's market (prices are in BDT).
 */
export const WORKSPACE_UTC_OFFSET_MINUTES = 6 * 60;
export const WORKSPACE_TIME_ZONE = "Asia/Dhaka";

export const DRAFT_COPY_SUFFIX = " (Copy)";
