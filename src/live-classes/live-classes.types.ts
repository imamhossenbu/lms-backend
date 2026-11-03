/** Response shapes for the admin panel's Live Classes pages — field for field `lms-admin-panel/src/types/liveClass.ts`. */

export type LivePlatform = "ZOOM" | "GOOGLE_MEET" | "TEAMS" | "CUSTOM";
export type LiveClassType = "INTERACTIVE" | "WEBINAR" | "WORKSHOP" | "QA";
export type LiveStoredStatus = "ACTIVE" | "CANCELLED";
export type LiveDisplayStatus = "LIVE" | "COMPLETED" | "UPCOMING" | "SCHEDULED" | "CANCELLED";
export type ReminderOffset = "NONE" | "5" | "15" | "30" | "60" | "1440";
export type AttendanceStatus = "ATTENDED" | "ABSENT" | "NOT_JOINED";
export type LiveQuestionStatus = "ANSWERED" | "PENDING";
export type LiveResourceType = "RECORDING" | "DOCUMENT" | "LINK" | "CODE";
export type LiveResourceVisibility = "ALL_STUDENTS" | "ATTENDEES" | "HIDDEN";
export type LiveActivityKind =
  | "CLASS_STARTED"
  | "STUDENTS_JOINED"
  | "QUESTION_ASKED"
  | "QUESTION_ANSWERED"
  | "SCREEN_SHARED"
  | "RESOURCE_SHARED"
  | "CLASS_ENDED"
  | "CLASS_SCHEDULED"
  | "CLASS_UPDATED"
  | "CLASS_CANCELLED";

export interface LiveClassSettings {
  allowQa: boolean;
  enableChat: boolean;
  recordClass: boolean;
  makePublic: boolean;
  sendReminder: boolean;
  autoAttendance: boolean;
}

/** Everything the Schedule / Edit form owns (= panel `LiveClassFields`). */
export interface LiveClassFields {
  title: string;
  descriptionHtml: string;
  courseId: string;
  instructorId: string;
  type: LiveClassType;
  /** "YYYY-MM-DD" (workspace day). */
  date: string;
  /** "HH:mm". */
  startTime: string;
  endTime: string;
  platform: LivePlatform;
  meetingLink: string;
  meetingId: string;
  passcode: string;
  sendLinkToStudents: boolean;
  capacity: number;
  settings: LiveClassSettings;
  reminder: ReminderOffset;
  thumbnailUrl: string;
}

export interface LiveClassItem extends LiveClassFields {
  id: string;
  status: LiveStoredStatus;
  createdAt: string;
  updatedAt: string;
}

export interface LivePerson {
  id: string;
  name: string;
  email: string;
}

/** List row: the class + what the list cards / columns show. */
export interface LiveClassListItem extends LiveClassItem {
  displayStatus: LiveDisplayStatus;
  course: { id: string; title: string };
  instructor: LivePerson;
  /** Students invited (enrolled, capped by capacity). */
  enrolledCount: number;
  attendees: number;
}

export interface LiveEnrollment {
  /** Row id = the student's id (one row per student per class). */
  id: string;
  classId: string;
  student: LivePerson;
  enrolledAt: string;
  status: AttendanceStatus;
  /** "HH:mm" (workspace time) or "". */
  joinTime: string;
  leaveTime: string;
  watchMinutes: number;
}

export interface LiveQuestion {
  id: string;
  classId: string;
  student: LivePerson;
  question: string;
  /** "HH:mm" (workspace time). */
  askedAt: string;
  status: LiveQuestionStatus;
  answerHtml: string;
}

export interface LiveResource {
  id: string;
  classId: string;
  type: LiveResourceType;
  title: string;
  description: string;
  url: string;
  size: number;
  visibility: LiveResourceVisibility;
  addedAt: string;
}

export interface LiveActivity {
  id: string;
  classId: string;
  kind: LiveActivityKind;
  title: string;
  detail: string;
  actor: string;
  at: string;
  refId?: string;
}
