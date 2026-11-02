/**
 * Instructors API response shapes. Field names follow the admin panel contract
 * (lms-admin-panel: src/types/instructor.ts + components/instructors/details/*Data.ts).
 * Dates are ISO-8601, money is a plain number with its currency, durations are minutes.
 * Visual-only fields (orderNumber, iconType, shortTitle, formatted strings) are derived client-side.
 */

export type InstructorStatusLabel = "Active" | "Inactive";

export interface Revenue {
  amount: number;
  currency: string;
}

export interface InstructorListItem {
  id: string;
  name: string;
  /** Professional title, e.g. "Senior Web Developer" ("" when not set). */
  title: string;
  expertise: string;
  email: string;
  phone: string;
  avatarUrl: string | null;
  status: InstructorStatusLabel;
  emailVerified: boolean;
  joinDate: string;
  lastLoginAt: string | null;
  coursesCount: number;
  /** Distinct students across all of the instructor's courses. */
  studentsCount: number;
  /** Sum of PAID orders for the instructor's courses. */
  totalRevenue: Revenue;
  /** Average of approved review ratings, 1 decimal (0 when none). */
  rating: number;
  reviewsCount: number;
}

export interface InstructorDetails extends InstructorListItem {
  bio: string;
  skills: string[];
  website: string;
  socials: { linkedin: string; twitter: string; website: string };
  /** Total length of the instructor's courses. */
  teachingMinutes: number;
  account: { twoFactorEnabled: boolean; createdAt: string; lastLogin: string | null };
}

export type InstructorCourseStatus = "Active" | "Draft";

export interface InstructorCourseRow {
  id: string;
  title: string;
  subtitle: string;
  slug: string;
  thumbnailUrl: string | null;
  category: string;
  studentsCount: number;
  lessonsCount: number;
  durationMinutes: number;
  price: number;
  isFree: boolean;
  status: InstructorCourseStatus;
  rating: number;
  reviewsCount: number;
  revenue: Revenue;
}

export interface CourseRef {
  id: string;
  title: string;
}

export interface InstructorStudentRow {
  /** Enrollment id. */
  id: string;
  student: { id: string; name: string; email: string; avatarUrl: string | null };
  course: CourseRef;
  enrolledOn: string;
  progress: number;
  status: "Active" | "Inactive";
}

export interface InstructorReviewRow {
  id: string;
  student: { id: string; name: string; email: string; avatarUrl: string | null };
  course: CourseRef;
  rating: number;
  comment: string;
  status: "Pending" | "Approved" | "Rejected";
  date: string;
}

export interface ReviewSummary {
  average: number;
  total: number;
  /** Count per star, index 0 = 1 star … index 4 = 5 stars. */
  distribution: [number, number, number, number, number];
}

export type ScheduleEventType = "live" | "assignment";
export type ScheduleEventStatus = "Upcoming" | "Completed" | "Cancelled";

export interface ScheduleEvent {
  id: string;
  title: string;
  type: ScheduleEventType;
  course: CourseRef;
  start: string;
  end: string;
  status: ScheduleEventStatus;
  meetingUrl: string | null;
}

export type ActivityLogType = "student_enrolled" | "new_review" | "live_class" | "earning" | "note_added" | "account_action";
export type ActivityActorRole = "Super Admin" | "Admin" | "Instructor" | "Student" | "Automated";

export interface ActivityLogEntry {
  id: string;
  type: ActivityLogType;
  at: string;
  actor: { name: string; role: ActivityActorRole; avatarUrl: string | null };
  details: string;
  ip: string | null;
  device: "Web" | "Mobile" | "System";
}

export type InstructorNoteType = "General" | "Performance" | "Content Update" | "Onboarding" | "Meeting" | "Issue" | "Payment";
export type NotePriority = "Low" | "Medium" | "High";

export interface InstructorNoteItem {
  id: string;
  instructorId: string;
  title: string;
  /** Sanitized HTML. */
  content: string;
  type: InstructorNoteType;
  priority: NotePriority;
  tags: string[];
  /** yyyy-mm-dd, or null when no reminder. */
  reminderDate: string | null;
  author: { id: string; name: string; avatarUrl: string | null };
  createdAt: string;
  updatedAt: string;
}
