/**
 * Who may open a lesson — pure decision (no I/O) for students. Staff (ADMIN / TEACHER) are never gated.
 * Reads the lesson row (status, isPreview) and the editor settings the panel saves in Lesson.editorSettings
 * (`content` publish schedule, `access`, `drip`), all in the panel's shape. Missing settings = no restriction.
 */
import { localToInstant } from "../common/workspace-time";

/**
 * What a lesson list (curriculum, module lessons, public course detail) shows to non-staff: the outline only.
 * Content and video stay behind GET lesson, which applies the gate; free-preview lessons keep them.
 */
export function outlineOnly<T extends { isPreview: boolean; content?: string | null; videoUrl?: string | null }>(lesson: T): T {
  return lesson.isPreview ? lesson : { ...lesson, content: null, videoUrl: null };
}

export type LessonGateResult =
  | { allowed: true }
  /** `hidden`: answer as if the lesson didn't exist (404); otherwise 403 with `message`. */
  | { allowed: false; hidden: boolean; reason: LessonGateReason; message: string };

export type LessonGateReason = "NOT_PUBLISHED" | "NOT_ENROLLED" | "PRIVATE" | "LOCKED" | "PREREQUISITE" | "DATE_WINDOW" | "COUNTRY" | "DRIP";

export interface LessonGateInput {
  lesson: { id: string; status: string; isPreview: boolean; editorSettings?: unknown };
  /** Lesson ids of the course in curriculum order (module order, then lesson order). */
  curriculum: string[];
  /** Active enrollment's start, or null when the student isn't enrolled. */
  enrolledAt: Date | null;
  completedLessonIds: Set<string>;
  /** ISO country of the request (from the CDN header), or null when unknown. */
  country: string | null;
  now?: Date;
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const str = (v: unknown) => (typeof v === "string" ? v : "");
const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const deny = (reason: LessonGateReason, message: string, hidden = false): LessonGateResult => ({ allowed: false, hidden, reason, message });

const UNIT_DAYS: Record<string, number> = { DAYS: 1, WEEKS: 7, MONTHS: 30 };

function formatWhen(at: Date) {
  return at.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" }) + " UTC";
}

export function lessonGate(input: LessonGateInput): LessonGateResult {
  const now = input.now ?? new Date();
  const settings = obj(input.lesson.editorSettings);
  const content = obj(settings.content);
  const access = obj(settings.access);
  const drip = obj(settings.drip);

  // 1. Publishing: drafts don't exist for students; scheduled lessons open at their publish time.
  const status = input.lesson.status.toUpperCase();
  if (status === "SCHEDULED") {
    const at = localToInstant(str(content.publishDate), str(content.publishTime));
    if (!at || at > now) return deny("NOT_PUBLISHED", "This lesson isn't available yet.", true);
  } else if (status !== "PUBLISHED") {
    return deny("NOT_PUBLISHED", "This lesson isn't available.", true);
  }

  // 2. Free preview: open to everyone (no further rules).
  if (input.lesson.isPreview) return { allowed: true };

  // 3. Enrollment.
  if (!input.enrolledAt) return deny("NOT_ENROLLED", "You must be enrolled in this course to access this lesson.");

  // 4. Visibility.
  const visibility = str(access.visibility);
  if (visibility === "PRIVATE") return deny("PRIVATE", "This lesson isn't available.", true);
  if (visibility === "LOCKED") return deny("LOCKED", "This lesson is locked.");

  // 5. Access type: previous / specific lesson completed first.
  const accessType = str(access.accessType);
  if (accessType === "PREVIOUS_LESSON") {
    const i = input.curriculum.indexOf(input.lesson.id);
    const prev = i > 0 ? input.curriculum[i - 1] : undefined;
    if (prev && !input.completedLessonIds.has(prev)) return deny("PREREQUISITE", "Complete the previous lesson to unlock this one.");
  } else if (accessType === "SPECIFIC_LESSON") {
    const req = str(access.prerequisiteLessonId);
    if (req && req !== input.lesson.id && input.curriculum.includes(req) && !input.completedLessonIds.has(req))
      return deny("PREREQUISITE", "Complete the required lesson to unlock this one.");
  }

  // 6. Date window.
  const window = obj(access.dateRestriction);
  if (window.enabled === true) {
    const start = localToInstant(str(window.startDate), str(window.startTime));
    const end = localToInstant(str(window.endDate), str(window.endTime));
    if (start && now < start) return deny("DATE_WINDOW", `This lesson opens on ${formatWhen(start)}.`);
    if (end && now > end) return deny("DATE_WINDOW", "This lesson is no longer available.");
  }

  // 7. Countries (only when the request's country is known).
  const geo = obj(access.geoRestriction);
  const countries = strs(geo.countries).map((c) => c.toUpperCase());
  if (geo.enabled === true && countries.length && input.country && !countries.includes(input.country.toUpperCase()))
    return deny("COUNTRY", "This lesson isn't available in your country.");

  // 8. Drip schedule.
  const lockedMessage = str(drip.lockedMessage).trim();
  const dripDeny = (fallback: string) => deny("DRIP", lockedMessage || fallback, str(drip.beforeRelease) === "HIDE");
  const releaseType = str(drip.releaseType);
  if (releaseType === "AFTER_ENROLLMENT") {
    const days = (Number(drip.releaseValue) || 0) * (UNIT_DAYS[str(drip.releaseUnit)] ?? 1);
    const at = new Date(input.enrolledAt.getTime() + days * 86_400_000);
    if (at > now) return dripDeny(`This lesson unlocks on ${formatWhen(at)}.`);
  } else if (releaseType === "SPECIFIC_DATE") {
    const at = localToInstant(str(drip.releaseDate), str(drip.releaseTime));
    if (at && at > now) return dripDeny(`This lesson unlocks on ${formatWhen(at)}.`);
  } else if (releaseType === "MANUAL") {
    return dripDeny("Your instructor will release this lesson soon.");
  }
  const deps = obj(drip.dependencies);
  if (deps.enabled === true && strs(deps.lessonIds).some((id) => id !== input.lesson.id && input.curriculum.includes(id) && !input.completedLessonIds.has(id)))
    return dripDeny("Complete the earlier lessons to unlock this one.");

  return { allowed: true };
}
