/** Enum values + limits shared by the DTOs, rules and mapper (copied from the panel's communitySchema / types). */

export const THREAD_CATEGORIES = ["QUESTION", "DISCUSSION", "ANNOUNCEMENT", "SHOWCASE", "FEEDBACK"] as const;
/** Categories students may post (announcements are staff-only). */
export const STUDENT_THREAD_CATEGORIES = ["QUESTION", "DISCUSSION", "SHOWCASE", "FEEDBACK"] as const;
export const REPORT_REASONS = ["SPAM", "ABUSIVE", "OFF_TOPIC", "PLAGIARISM", "OTHER"] as const;
export const REPORT_STATUSES = ["OPEN", "DISMISSED", "ACTIONED"] as const;
export const REPORT_ACTIONS = ["DISMISS", "REMOVE_CONTENT", "HIDE_THREAD"] as const;
export const THREAD_FLAGS = ["isPinned", "isLocked", "isHidden"] as const;

export const COMMUNITY_TABS = ["all", "unanswered", "moderation", "pinned", "resolved", "hidden"] as const;
/** Tabs a student can use (moderation / hidden are staff views). */
export const STUDENT_TABS = ["all", "unanswered", "pinned", "resolved"] as const;
export const COMMUNITY_SORTS = ["activity", "newest", "replies", "views"] as const;

export const COMMUNITY_LIMITS = {
  titleMin: 8,
  titleMax: 150,
  bodyMin: 20,
  bodyMax: 5000,
  replyMin: 2,
  replyMax: 3000,
  tagsMax: 5,
  tagMin: 2,
  tagMax: 24,
  resolutionNoteMax: 300,
  reportNoteMax: 300,
  bulkMax: 100,
} as const;

export const TAG_PATTERN = /^[a-z0-9-]+$/;

/** User.role → community role. Instructors are stored as "TEACHER". */
export const STUDENT_ROLE = "STUDENT";
export const TEACHER_ROLE = "TEACHER";

/** Shown for authors whose user row no longer exists (legacy rows have no FK). */
export const DELETED_MEMBER_NAME = "Deleted user";
