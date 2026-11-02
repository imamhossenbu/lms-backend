import type { StudentNoteCategory } from "../../generated/prisma";
import type { StudentNoteCategoryValue, StudentStatusLabel } from "./students.types";

export const STUDENT_ROLE = "STUDENT";
export const STUDENT_MANAGER_ROLES = ["ADMIN"] as const;

/** User.status (DB) ↔ student status label (admin panel). PENDING = email not verified yet → shown as Inactive. */
export const STATUS_LABEL: Record<string, StudentStatusLabel> = {
  ACTIVE: "Active",
  PENDING: "Inactive",
  INACTIVE: "Inactive",
  BLOCKED: "Suspended",
};

export const STATUS_FROM_LABEL: Record<StudentStatusLabel, string> = {
  Active: "ACTIVE",
  Inactive: "INACTIVE",
  Suspended: "BLOCKED",
};

/** DB statuses matched by a status-label filter. */
export const STATUSES_FOR_LABEL: Record<StudentStatusLabel, string[]> = {
  Active: ["ACTIVE"],
  Inactive: ["INACTIVE", "PENDING"],
  Suspended: ["BLOCKED"],
};

export const STUDENT_STATUS_LABELS = ["Active", "Inactive", "Suspended"] as const;

export const NOTE_CATEGORY_VALUES = ["good_progress", "needs_improvement", "student_support", "counseling_call", "payment_issue", "general"] as const;

export const NOTE_CATEGORY_LABEL: Record<StudentNoteCategoryValue, string> = {
  good_progress: "Good Progress",
  needs_improvement: "Needs Improvement",
  student_support: "Student Support",
  counseling_call: "Counseling Call",
  payment_issue: "Payment Issue",
  general: "General",
};

export const noteCategoryToDb = (v: StudentNoteCategoryValue) => v.toUpperCase() as StudentNoteCategory;
export const noteCategoryFromDb = (v: StudentNoteCategory) => v.toLowerCase() as StudentNoteCategoryValue;

/** "STU-" + first 7 chars of the id — stable, human-friendly reference. */
export const studentIdCode = (id: string) => `STU-${id.replace(/-/g, "").slice(0, 7).toUpperCase()}`;

/** Letter grade from a 0–100 percentage. */
export function letterGrade(pct: number): string {
  if (pct >= 93) return "A+";
  if (pct >= 85) return "A";
  if (pct >= 80) return "A-";
  if (pct >= 75) return "B+";
  if (pct >= 70) return "B";
  if (pct >= 65) return "B-";
  if (pct >= 60) return "C+";
  if (pct >= 50) return "C";
  if (pct >= 40) return "D";
  return "F";
}

export const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
