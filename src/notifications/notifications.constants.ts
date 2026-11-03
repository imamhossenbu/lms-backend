/** Enum values + limits shared by the DTOs, rules and mapper (copied from the panel's types/notification.ts + notificationSchema.ts). */

export const NOTIFICATION_CATEGORIES = ["ENROLLMENT", "PAYMENT", "SUBMISSION", "COMMUNITY", "LIVE_CLASS", "CERTIFICATE", "SYSTEM"] as const;
export const NOTIFICATION_PRIORITIES = ["NORMAL", "HIGH"] as const;
export const NOTIFICATION_CHANNELS = ["IN_APP", "EMAIL", "PUSH"] as const;
export const BROADCAST_AUDIENCES = ["ALL_STUDENTS", "COURSE", "INSTRUCTORS", "INACTIVE_STUDENTS"] as const;
export const BROADCAST_STATUSES = ["SENT", "SCHEDULED", "DRAFT", "CANCELLED"] as const;
export const DELIVERY_STATUSES = ["DELIVERED", "OPENED", "CLICKED", "FAILED"] as const;
export const BROADCAST_TIMINGS = ["NOW", "SCHEDULE"] as const;
export const INBOX_STATUSES = ["all", "unread", "archived"] as const;
export const TEMPLATE_TRIGGERS = [
  "ENROLLMENT_CONFIRMED",
  "PAYMENT_RECEIPT",
  "ASSIGNMENT_GRADED",
  "QUIZ_RESULT",
  "LIVE_CLASS_REMINDER",
  "CERTIFICATE_ISSUED",
  "COMMUNITY_REPLY",
  "COURSE_COMPLETED",
  "PASSWORD_RESET",
] as const;

export const LIMITS = {
  titleMin: 5,
  titleMax: 100,
  messageMin: 10,
  messageMax: 2000,
  /** Push notifications are truncated by devices. */
  pushMessageMax: 180,
  ctaLabelMax: 30,
  ctaUrlMax: 2000,
  /** Scheduled sends must be at least this far in the future. */
  scheduleLeadMinutes: 5,
  maxCourses: 50,
  templateNameMin: 3,
  templateNameMax: 60,
  templateSubjectMin: 3,
  templateSubjectMax: 120,
  templateBodyMin: 10,
  templateBodyMax: 1500,
  maxBulkIds: 200,
} as const;

/** INACTIVE_STUDENTS = students who haven't signed in for this many days (or never). */
export const INACTIVE_AFTER_DAYS = 30;
/** User statuses that never receive broadcasts. */
export const MUTED_USER_STATUSES = ["BLOCKED"];
export const STUDENT_ROLE = "STUDENT";
export const INSTRUCTOR_ROLE = "TEACHER";
/** Legacy Notification.type of broadcast rows. */
export const BROADCAST_TYPE = "BROADCAST";
export const DRAFT_COPY_SUFFIX = " (Copy)";
/** Emails are sent in batches of this size (Promise.allSettled per batch). */
export const EMAIL_BATCH_SIZE = 25;
/** Delivery errors shown in the recipients table. */
export const DELIVERY_ERRORS = {
  email: "Email could not be delivered",
  noEmail: "No email address on file",
  push: "No push device registered",
} as const;
