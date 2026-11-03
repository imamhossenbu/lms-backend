/**
 * Analytics response shapes — the backend contract for lms-admin-panel src/lib/analytics/analyticsTypes.ts,
 * src/lib/analytics/analyticsEngagement.ts and components/analytics/report/analyticsReport.ts. Dates are ISO
 * strings; money is a number in `currency` (BDT by default). Formatted text (currency, %, "vs previous 30 days")
 * stays client-side; bucket tick labels are included because they depend on workspace time.
 */

import type { OrderStatusLabel } from "../commerce/order-status";

// ---------------------------------------------------------------- internal (Date) shapes
export interface DateRange {
  from: Date;
  to: Date;
}

export interface ResolvedRange extends DateRange {
  fromKey: string | null;
  toKey: string | null;
  isAllTime: boolean;
  days: number;
}

export type Granularity = "day" | "week" | "month";

export interface TimeBucket {
  key: string;
  label: string;
  fullLabel: string;
  start: Date;
  /** Exclusive. */
  end: Date;
}

// ---------------------------------------------------------------- API shapes
export interface RangeMeta {
  from: string;
  to: string;
  /** Picker keys that produced the range; null = open end (both null = All time). */
  fromKey: string | null;
  toKey: string | null;
  isAllTime: boolean;
  days: number;
  /** Bucket size of this response's time series. */
  granularity: Granularity;
}

export interface Kpi {
  value: number;
  /** Same metric for the equally long window right before the range (0 for All time). */
  previous: number;
  /** null when previous is 0 or the range is All time. */
  changePct: number | null;
  /** Ten evenly spaced points (segment totals, or end-of-segment levels for stock metrics). */
  spark: number[];
}

export interface BucketPoint {
  key: string;
  label: string;
  fullLabel: string;
  start: string;
  end: string;
}

export interface RevenuePoint extends BucketPoint {
  gross: number;
  net: number;
  refunds: number;
  orders: number;
  paidOrders: number;
}

export interface CountPoint extends BucketPoint {
  value: number;
}

export interface StudentGrowthPoint extends BucketPoint {
  newStudents: number;
  activeStudents: number;
}

export interface BreakdownRow {
  key: string;
  label: string;
  value: number;
  count: number;
  share: number;
}

export interface RevenueCourseRow extends BreakdownRow {
  changePct: number | null;
}

export interface CourseRow {
  courseId: string;
  title: string;
  instructor: string;
  category: string;
  thumbnailUrl: string;
  price: number;
  enrollments: number;
  revenue: number;
  completionPct: number | null;
  rating: number | null;
}

export interface InstructorRow {
  id: string;
  name: string;
  avatarUrl?: string;
  courses: number;
  enrollments: number;
  revenue: number;
  rating: number | null;
}

export interface RecentOrderRow {
  id: string;
  orderNumber: string;
  studentId: string;
  studentName: string;
  avatarUrl?: string;
  course: string;
  amount: number;
  status: OrderStatusLabel;
  date: string;
}

export interface RecentEnrollmentRow {
  id: string;
  /** Latest Paid order for the same student + course; null for admin-assigned enrollments. */
  orderId: string | null;
  studentId: string;
  studentName: string;
  avatarUrl?: string;
  courseId: string;
  course: string;
  progress: number;
  enrolledAt: string;
}

export interface CompletionSegment {
  key: "completed" | "inProgress" | "stalled";
  label: string;
  count: number;
  pct: number;
}

export interface CompletionBreakdown {
  completionRate: number;
  enrolled: number;
  segments: CompletionSegment[];
}

export interface QuizPerformanceRow {
  quizId: string;
  title: string;
  courseId: string;
  attempts: number;
  finished: number;
  avgScore: number;
  passRate: number;
}

export interface QuizActivityPoint extends BucketPoint {
  attempts: number;
  passed: number;
  failed: number;
  unfinished: number;
}

export interface AssignmentPerformanceRow {
  assignmentId: string;
  title: string;
  courseId: string;
  submissions: number;
  late: number;
  onTimeRate: number;
  graded: number;
  avgScore: number | null;
}

export interface SubmissionPoint extends BucketPoint {
  total: number;
  onTime: number;
  late: number;
}

export interface LiveAttendancePoint extends BucketPoint {
  sessions: number;
  seats: number;
  attended: number;
  absent: number;
  attendanceRate: number;
}

export interface CommunityActivityPoint extends BucketPoint {
  threads: number;
  replies: number;
  reports: number;
}

export interface RetentionPoint extends BucketPoint {
  active: number;
  returning: number;
  newActive: number;
  retentionRate: number;
}

export type StudentRankBy = "completion" | "score" | "spent";
export type InstructorRankBy = "revenue" | "enrollments";

export interface StudentPerformanceRow {
  studentId: string;
  name: string;
  email: string;
  avatarUrl?: string;
  status: string;
  enrolled: number;
  completed: number;
  avgScore: number;
  completionRate: number;
  spent: number;
  lastActiveAt: string | null;
}

interface ReportBase {
  range: RangeMeta;
  currency: string;
}

export interface RevenueSummary {
  gross: Kpi;
  net: Kpi;
  refunds: Kpi;
  paidOrders: Kpi;
  avgOrderValue: Kpi;
}

export interface OrderSummary {
  placed: Kpi;
  conversion: Kpi;
  byStatus: Record<OrderStatusLabel, number>;
}

export interface StudentSummary {
  total: Kpi;
  newStudents: Kpi;
  activeLearners: Kpi;
  active: number;
  inactive: number;
  avgCompletion: number;
}

export interface LearningSummary {
  quizAttempts: Kpi;
  avgQuizScore: Kpi;
  quizPassRate: Kpi;
  submissions: Kpi;
  onTimeRate: Kpi;
  liveSessions: Kpi;
  attendanceRate: Kpi;
  certificatesIssued: Kpi;
}

export interface CommunitySummary {
  threads: Kpi;
  replies: Kpi;
  reports: Kpi;
  openReports: number;
}

/** GET /admin/analytics/dashboard — Dashboard home (app/page.tsx via useDashboardData). */
export interface DashboardReport extends ReportBase {
  kpis: { totalStudents: Kpi; activeInstructors: Kpi; publishedCourses: Kpi; totalRevenue: Kpi };
  revenue: RevenuePoint[];
  growth: StudentGrowthPoint[];
  enrollmentsByCourse: BreakdownRow[];
  completion: CompletionBreakdown;
  recentOrders: RecentOrderRow[];
  recentEnrollments: RecentEnrollmentRow[];
  topCourses: CourseRow[];
}

export type OverviewKpiKey = "netRevenue" | "orders" | "conversion" | "newEnrollments" | "activeLearners" | "avgCompletion" | "certificates" | "quizPassRate";

/** GET /admin/analytics/overview — OverviewTab (KpiGrid, SeriesComboChart, HighlightsCard). */
export interface OverviewReport extends ReportBase {
  kpis: Record<OverviewKpiKey, Kpi>;
  combo: (RevenuePoint & { enrollments: number })[];
  highlights: {
    bestCourse: CourseRow | null;
    bestDay: RevenuePoint | null;
    biggestChange: { key: OverviewKpiKey; label: string; kpi: Kpi } | null;
    topMethod: BreakdownRow | null;
    topCategory: BreakdownRow | null;
  };
}

/** GET /admin/analytics/revenue — RevenueTab. */
export interface RevenueReport extends ReportBase {
  summary: RevenueSummary;
  series: RevenuePoint[];
  granularity: Granularity;
  granularityOptions: Granularity[];
  byMethod: BreakdownRow[];
  byCategory: BreakdownRow[];
  byCourse: RevenueCourseRow[];
  orders: OrderSummary;
}

/** GET /admin/analytics/students — StudentsTab. */
export interface StudentsReport extends ReportBase {
  summary: StudentSummary;
  avgCompletion: Kpi;
  growth: StudentGrowthPoint[];
  retention: RetentionPoint[];
  completion: CompletionBreakdown;
  byCategory: BreakdownRow[];
  topStudents: StudentPerformanceRow[];
  studentRank: StudentRankBy;
}

/** GET /admin/analytics/courses — CoursesTab. */
export interface CoursesReport extends ReportBase {
  courses: { published: Kpi; total: number };
  enrollments: Kpi;
  revenue: Kpi;
  instructors: { active: Kpi; total: number; inactive: number };
  topCourses: CourseRow[];
  byCourse: BreakdownRow[];
  leaderboard: InstructorRow[];
  instructorRank: InstructorRankBy;
}

/** GET /admin/analytics/engagement — EngagementTab. */
export interface EngagementReport extends ReportBase {
  learning: LearningSummary;
  community: CommunitySummary;
  quizSeries: QuizActivityPoint[];
  quizzes: QuizPerformanceRow[];
  submissionSeries: SubmissionPoint[];
  assignments: AssignmentPerformanceRow[];
  liveSeries: LiveAttendancePoint[];
  certificateSeries: CountPoint[];
  communitySeries: CommunityActivityPoint[];
}
