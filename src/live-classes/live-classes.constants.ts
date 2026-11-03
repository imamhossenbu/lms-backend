/** Enum values + limits (copied from the panel's liveClassSchema). */

export const LIVE_PLATFORMS = ["ZOOM", "GOOGLE_MEET", "TEAMS", "CUSTOM"] as const;
export const LIVE_TYPES = ["INTERACTIVE", "WEBINAR", "WORKSHOP", "QA"] as const;
export const REMINDER_OFFSETS = ["NONE", "5", "15", "30", "60", "1440"] as const;
export const ATTENDANCE_STATUSES = ["ATTENDED", "ABSENT", "NOT_JOINED"] as const;
export const DISPLAY_STATUSES = ["LIVE", "COMPLETED", "UPCOMING", "SCHEDULED", "CANCELLED"] as const;
export const RESOURCE_TYPES = ["RECORDING", "DOCUMENT", "LINK", "CODE"] as const;
export const RESOURCE_VISIBILITIES = ["ALL_STUDENTS", "ATTENDEES", "HIDDEN"] as const;

export const LIVE_LIMITS = {
  titleMax: 120,
  descriptionMax: 1000,
  minMinutes: 15,
  maxMinutes: 8 * 60,
  capacityMax: 10_000,
  questionMax: 500,
  answerMax: 2000,
} as const;

/** UPCOMING = starts within this many days. */
export const UPCOMING_WINDOW_DAYS = 3;

export const PLATFORM_HOSTS: Record<"ZOOM" | "GOOGLE_MEET" | "TEAMS", RegExp> = {
  ZOOM: /(^|\.)zoom\.us$/i,
  GOOGLE_MEET: /^meet\.google\.com$/i,
  TEAMS: /(^|\.)teams\.(microsoft|live)\.com$/i,
};
export const PLATFORM_NAME = { ZOOM: "Zoom", GOOGLE_MEET: "Google Meet", TEAMS: "Microsoft Teams" } as const;

export const DEFAULT_SETTINGS = { allowQa: true, enableChat: true, recordClass: false, makePublic: false, sendReminder: false, autoAttendance: true };

/** Attendance.status values that mean "was in the class". */
export const ATTENDED_ROW_STATUSES = ["ACTIVE", "COMPLETED", "SUSPENDED", "ATTENDED"];

export const LIVE_COPY_SUFFIX = " (Copy)";
