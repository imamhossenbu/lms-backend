import type { InstructorNoteType as DbNoteType, NotePriority as DbPriority } from "../../generated/prisma";
import type { InstructorCourseStatus, InstructorNoteType, InstructorStatusLabel, NotePriority } from "./instructors.types";

export const INSTRUCTOR_ROLE = "TEACHER";
export const INSTRUCTOR_MANAGER_ROLES = ["ADMIN"] as const;
export const DEFAULT_CURRENCY = "BDT";
export const PAID_ORDER_STATUS = "PAID";
export const APPROVED_REVIEW_STATUS = "APPROVED";

export const INSTRUCTOR_STATUS_LABELS = ["Active", "Inactive"] as const;

/** Only ACTIVE counts as Active; PENDING / INACTIVE / BLOCKED are all shown as Inactive. */
export const instructorStatusLabel = (dbStatus: string): InstructorStatusLabel => (dbStatus === "ACTIVE" ? "Active" : "Inactive");
export const STATUS_FROM_LABEL: Record<InstructorStatusLabel, string> = { Active: "ACTIVE", Inactive: "INACTIVE" };
export const STATUSES_FOR_LABEL: Record<InstructorStatusLabel, string[]> = { Active: ["ACTIVE"], Inactive: ["INACTIVE", "PENDING", "BLOCKED"] };

export const courseStatusLabel = (dbStatus: string): InstructorCourseStatus => (dbStatus === "PUBLISHED" ? "Active" : "Draft");

export const NOTE_TYPES = ["General", "Performance", "Content Update", "Onboarding", "Meeting", "Issue", "Payment"] as const;
export const NOTE_PRIORITIES = ["Low", "Medium", "High"] as const;

const NOTE_TYPE_TO_DB: Record<InstructorNoteType, DbNoteType> = {
  General: "GENERAL",
  Performance: "PERFORMANCE",
  "Content Update": "CONTENT_UPDATE",
  Onboarding: "ONBOARDING",
  Meeting: "MEETING",
  Issue: "ISSUE",
  Payment: "PAYMENT",
};
const NOTE_TYPE_FROM_DB = Object.fromEntries(Object.entries(NOTE_TYPE_TO_DB).map(([label, db]) => [db, label])) as Record<DbNoteType, InstructorNoteType>;

export const noteTypeToDb = (t: InstructorNoteType) => NOTE_TYPE_TO_DB[t];
export const noteTypeFromDb = (t: DbNoteType) => NOTE_TYPE_FROM_DB[t];
export const priorityToDb = (p: NotePriority) => p.toUpperCase() as DbPriority;
export const priorityFromDb = (p: DbPriority) => (p.charAt(0) + p.slice(1).toLowerCase()) as NotePriority;

/** `User.skills` is free text: accepts a JSON array or a comma-separated list. */
export function parseSkills(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String).map((s) => s.trim()).filter(Boolean);
  } catch {
    /* comma-separated */
  }
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

/** `User.socialLinks` is a JSON object string. */
export function parseSocials(raw: string | null): { linkedin: string; twitter: string; website: string } {
  let obj: Record<string, unknown> = {};
  try {
    obj = raw ? JSON.parse(raw) : {};
  } catch {
    obj = {};
  }
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  return { linkedin: str(obj.linkedin), twitter: str(obj.twitter), website: str(obj.website) };
}

export const round1 = (n: number) => Math.round(n * 10) / 10;
export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Rough device class from a User-Agent header. */
export const deviceFromUserAgent = (ua: string): "Web" | "Mobile" | "System" =>
  !ua ? "System" : /mobile|android|iphone|ipad/i.test(ua) ? "Mobile" : "Web";
