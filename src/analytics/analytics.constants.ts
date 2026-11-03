import { DB_STATUSES_FOR } from "../commerce/order-status";
import { ATTENDED_ROW_STATUSES } from "../live-classes/live-classes.constants";

export const DEFAULT_CURRENCY = "BDT";

/** Plan feature that unlocks the Revenue / Students / Courses / Engagement reports (Overview + Dashboard are always on). */
export const ADVANCED_ANALYTICS_FEATURE = "advancedAnalytics";

/** DB order statuses per lifecycle bucket (legacy spellings included). */
export const PAID_STATUSES = DB_STATUSES_FOR.Paid;
export const REFUNDED_STATUSES = DB_STATUSES_FOR.Refunded;

/** Attendance rows that count as "attended" (same rule as Live Classes). */
export const ATTENDED_STATUSES = ATTENDED_ROW_STATUSES;

export const STUDENT_ROLE = "STUDENT";
export const INSTRUCTOR_ROLE = "TEACHER";
export const ACTIVE_USER_STATUS = "ACTIVE";
export const PUBLISHED_COURSE_STATUS = "PUBLISHED";
export const CANCELLED_LIVE_STATUS = "CANCELLED";

/** List sizes (same as the panel). */
export const LIMITS = {
  dashboardRows: 5,
  dashboardCourses: 5,
  topStudents: 10,
  leaderboard: 8,
  /** Courses tab table: every course with activity, capped. */
  coursesTable: 100,
  performanceRows: 50,
} as const;

/** Legacy gateway orders have no paymentMethod — they were all SSLCommerz checkouts (same rule as Orders). */
export const LEGACY_PAYMENT_METHOD = "SSLCommerz";
