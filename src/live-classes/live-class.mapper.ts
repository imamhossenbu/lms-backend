import type { Attendance, LiveClass, LiveClassEvent, LiveQuestion as QuestionRow, LiveResource as ResourceRow, Prisma } from "../../generated/prisma";
import { sanitizeRichText } from "../common/html";
import { instantToLocal, localToInstant } from "../common/workspace-time";
import { ATTENDED_ROW_STATUSES, DEFAULT_SETTINGS, PLATFORM_HOSTS, UPCOMING_WINDOW_DAYS } from "./live-classes.constants";
import type {
  AttendanceStatus,
  LiveActivity,
  LiveClassFields,
  LiveClassItem,
  LiveClassSettings,
  LiveClassType,
  LiveDisplayStatus,
  LiveEnrollment,
  LivePerson,
  LivePlatform,
  LiveQuestion,
  LiveResource,
  LiveResourceType,
  LiveResourceVisibility,
  ReminderOffset,
} from "./live-classes.types";

/** DB rows ⇄ panel shapes. Pure. */

const DAY_MS = 86_400_000;

/** Platform of a first-version row, guessed from its link. */
export function platformOf(url: string): LivePlatform {
  try {
    const host = new URL(url).hostname;
    return (Object.entries(PLATFORM_HOSTS).find(([, re]) => re.test(host))?.[0] as LivePlatform | undefined) ?? "CUSTOM";
  } catch {
    return "CUSTOM";
  }
}

export function settingsOf(raw: Prisma.JsonValue): LiveClassSettings {
  const s = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const pick = (k: keyof LiveClassSettings) => (typeof s[k] === "boolean" ? (s[k] as boolean) : DEFAULT_SETTINGS[k]);
  return {
    allowQa: pick("allowQa"),
    enableChat: pick("enableChat"),
    recordClass: pick("recordClass"),
    makePublic: pick("makePublic"),
    sendReminder: pick("sendReminder"),
    autoAttendance: pick("autoAttendance"),
  };
}

export const storedStatus = (status: string) => (status === "CANCELLED" ? "CANCELLED" : "ACTIVE");

/** LIVE / COMPLETED / UPCOMING (≤ 3 days) / SCHEDULED from the clock; CANCELLED from the stored status. */
export function displayStatus(c: Pick<LiveClass, "status" | "startTime" | "endTime">, now = new Date()): LiveDisplayStatus {
  if (storedStatus(c.status) === "CANCELLED") return "CANCELLED";
  const t = now.getTime();
  if (t >= c.startTime.getTime() && t < c.endTime.getTime()) return "LIVE";
  if (t >= c.endTime.getTime()) return "COMPLETED";
  return c.startTime.getTime() - t <= UPCOMING_WINDOW_DAYS * DAY_MS ? "UPCOMING" : "SCHEDULED";
}

/** Prisma filter for a display status (mirrors displayStatus). */
export function displayStatusWhere(s: LiveDisplayStatus, now = new Date()): Prisma.LiveClassWhereInput {
  const active = { status: { not: "CANCELLED" } };
  const soon = new Date(now.getTime() + UPCOMING_WINDOW_DAYS * DAY_MS);
  switch (s) {
    case "CANCELLED":
      return { status: "CANCELLED" };
    case "LIVE":
      return { ...active, startTime: { lte: now }, endTime: { gt: now } };
    case "COMPLETED":
      return { ...active, endTime: { lte: now } };
    case "UPCOMING":
      return { ...active, startTime: { gt: now, lte: soon } };
    case "SCHEDULED":
      return { ...active, startTime: { gt: soon } };
  }
}

export function toLiveClassItem(c: LiveClass): LiveClassItem {
  const start = instantToLocal(c.startTime);
  const end = instantToLocal(c.endTime);
  return {
    id: c.id,
    title: c.title,
    descriptionHtml: c.description ?? "",
    courseId: c.courseId,
    instructorId: c.instructorId,
    type: c.type as LiveClassType,
    date: start.date,
    startTime: start.time,
    endTime: end.time,
    platform: c.platform === "CUSTOM" ? platformOf(c.meetingUrl) : (c.platform as LivePlatform),
    meetingLink: c.meetingUrl,
    meetingId: c.meetingId,
    passcode: c.passcode,
    sendLinkToStudents: c.sendLinkToStudents,
    capacity: c.capacity,
    settings: settingsOf(c.settings),
    reminder: c.reminder as ReminderOffset,
    thumbnailUrl: c.thumbnailUrl,
    status: storedStatus(c.status),
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

/** Form fields → columns. The class sits on one workspace day: end is on the same date as the start. */
export function toLiveClassData(f: LiveClassFields): Omit<Prisma.LiveClassUncheckedCreateInput, "institutionId" | "status"> {
  return {
    title: f.title.trim(),
    description: sanitizeRichText(f.descriptionHtml),
    courseId: f.courseId,
    instructorId: f.instructorId,
    type: f.type,
    startTime: localToInstant(f.date, f.startTime)!,
    endTime: localToInstant(f.date, f.endTime)!,
    platform: f.platform,
    meetingUrl: f.meetingLink.trim(),
    meetingId: f.meetingId.trim(),
    passcode: f.passcode.trim(),
    sendLinkToStudents: f.sendLinkToStudents,
    capacity: f.capacity,
    settings: { ...f.settings },
    reminder: f.settings.sendReminder ? f.reminder : "NONE",
    thumbnailUrl: f.thumbnailUrl,
  };
}

export function fieldsOf(item: LiveClassItem): LiveClassFields {
  const { id: _i, status: _s, createdAt: _c, updatedAt: _u, ...fields } = item;
  return fields;
}

/** Attendance row → panel status. RSVP counts as Absent only once the class is over. */
export function attendanceStatus(row: Pick<Attendance, "status" | "joinedAt"> | undefined, classEnded: boolean): AttendanceStatus {
  if (!row) return "NOT_JOINED";
  if (row.joinedAt && ATTENDED_ROW_STATUSES.includes(row.status)) return "ATTENDED";
  if (row.status === "ABSENT") return "ABSENT";
  if (row.status === "RSVP") return classEnded ? "ABSENT" : "NOT_JOINED";
  return "NOT_JOINED";
}

/** Minutes watched: pinged minutes, or join→leave when pings are missing. */
export function watchMinutesOf(row: Pick<Attendance, "durationMinutes" | "joinedAt" | "leftAt">): number {
  if (row.durationMinutes > 0) return row.durationMinutes;
  if (row.joinedAt && row.leftAt) return Math.max(0, Math.round((row.leftAt.getTime() - row.joinedAt.getTime()) / 60_000));
  return 0;
}

export function toEnrollment(classId: string, student: LivePerson, enrolledAt: Date, row: Attendance | undefined, classEnded: boolean): LiveEnrollment {
  const status = attendanceStatus(row, classEnded);
  const attended = status === "ATTENDED" && row;
  return {
    id: student.id,
    classId,
    student,
    enrolledAt: enrolledAt.toISOString(),
    status,
    joinTime: attended ? instantToLocal(row.joinedAt).time : "",
    leaveTime: attended ? instantToLocal(row.leftAt).time : "",
    watchMinutes: attended ? watchMinutesOf(row) : 0,
  };
}

export const toQuestion = (q: QuestionRow & { user: LivePerson }): LiveQuestion => ({
  id: q.id,
  classId: q.liveClassId,
  student: { id: q.user.id, name: q.user.name, email: q.user.email },
  question: q.question,
  askedAt: instantToLocal(q.createdAt).time,
  status: q.status === "ANSWERED" ? "ANSWERED" : "PENDING",
  answerHtml: q.answerHtml,
});

export const toResource = (r: ResourceRow): LiveResource => ({
  id: r.id,
  classId: r.liveClassId,
  type: r.type as LiveResourceType,
  title: r.title,
  description: r.description,
  url: r.url,
  size: r.size,
  visibility: r.visibility as LiveResourceVisibility,
  addedAt: r.createdAt.toISOString(),
});

export const toActivity = (e: LiveClassEvent): LiveActivity => ({
  id: e.id,
  classId: e.liveClassId,
  kind: e.kind,
  title: e.title,
  detail: e.detail,
  actor: e.actorName,
  at: e.createdAt.toISOString(),
  ...(e.refId && { refId: e.refId }),
});
