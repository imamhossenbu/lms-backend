import { ForbiddenException, Injectable } from "@nestjs/common";
import { statusLabel } from "../../commerce/order-status";
import type { AuthUser } from "../../common/auth-user";
import { localToInstant } from "../../common/workspace-time";
import {
  biggestChange,
  completionBreakdown,
  flow,
  makeKpi,
  mean,
  pctOf,
  point,
  rankCourses,
  rankInstructors,
  ratio,
  retentionPoints,
  round1,
  round2,
  series,
  stock,
  stockMean,
  toBreakdown,
  withChange,
} from "../analytics-metrics";
import { autoGranularity, buildBuckets, bucketEdges, DAY_MS, granularityOptions, kpiEdges, previousRange, resolveGranularity, resolveRange } from "../analytics-range";
import { ADVANCED_ANALYTICS_FEATURE, DEFAULT_CURRENCY, INSTRUCTOR_ROLE, LIMITS, STUDENT_ROLE } from "../analytics.constants";
import type {
  CommunitySummary,
  DateRange,
  CoursesReport,
  DashboardReport,
  EngagementReport,
  Granularity,
  Kpi,
  LearningSummary,
  OrderSummary,
  OverviewReport,
  RangeMeta,
  ResolvedRange,
  RevenuePoint,
  RevenueReport,
  RevenueSummary,
  StudentSummary,
  StudentsReport,
  TimeBucket,
} from "../analytics.types";
import type { AnalyticsRangeDto, CoursesReportQueryDto, RevenueReportQueryDto, StudentsReportQueryDto } from "../dto/analytics-query.dto";
import { AnalyticsDataService, type Scope } from "./analytics-data.service";

interface Ctx {
  scope: Scope;
  range: ResolvedRange;
  currency: string;
  now: Date;
}

/**
 * Admin panel › Dashboard + Analytics reports. Mirrors the panel's analytics core
 * (lib/analytics/analyticsMetrics.ts + analyticsEngagement.ts + components/analytics/report/analyticsReport.ts),
 * computed from real tables instead of mock stores. Definitions:
 *  - Revenue (net)   Σ totalAmount of Paid orders by payment date (paidAt ?? createdAt) = Orders "Total Revenue".
 *                    Gross = Paid + Refunded, refunds = Refunded (cohort view, gross − refunds = net).
 *  - Orders          placed by createdAt; conversion = (Paid + Refunded) / placed.
 *  - Enrollments     Enrollment rows of workspace students by enrolledAt (refunds delete them).
 *  - Students        role STUDENT, not deleted; total = joined by window end; Active = status ACTIVE.
 *  - Active learners distinct students with an order, quiz attempt, submission, attended live class,
 *                    community post or completed lesson in the window.
 *  - Instructors     role TEACHER; active = status ACTIVE and joined by window end.
 *  - Published       PUBLISHED workspace course with its first workspace enrollment by window end.
 */
@Injectable()
export class AnalyticsReportsService {
  constructor(private readonly data: AnalyticsDataService) {}

  // ---------------------------------------------------------------- context

  private async ctx(actor: AuthUser, q: AnalyticsRangeDto, opts: { advanced?: boolean } = {}): Promise<Ctx> {
    const scope = actor.institutionId ?? null;
    if (opts.advanced) await this.assertAdvanced(scope);
    const now = new Date();
    // No `from` (All time, or a lone `to`) starts at the first data day.
    const [earliest, currency] = await Promise.all([q.from ? Promise.resolve(null) : this.data.dataStart(scope), this.data.currency(scope)]);
    const range = resolveRange({ from: q.from, to: q.to }, { now, earliest });
    return { scope, range, currency: currency ?? DEFAULT_CURRENCY, now };
  }

  /** Revenue / Students / Courses / Engagement need the plan's "Advanced analytics" (legacy workspaces are not gated). */
  private async assertAdvanced(scope: Scope) {
    if (!scope) return;
    const plan = await this.data.planFeatures(scope);
    if (plan && plan.features.includes(ADVANCED_ANALYTICS_FEATURE)) return;
    throw new ForbiddenException({
      statusCode: 403,
      error: "Forbidden",
      code: "PLAN_FEATURE_REQUIRED",
      feature: ADVANCED_ANALYTICS_FEATURE,
      message: `Advanced analytics isn't included in your ${plan?.plan ?? "current"} plan. Upgrade to unlock revenue, student, course and engagement reports.`,
    });
  }

  private meta(c: Ctx, granularity: Granularity): RangeMeta {
    const r = c.range;
    return { from: r.from.toISOString(), to: r.to.toISOString(), fromKey: r.fromKey, toKey: r.toKey, isAllTime: r.isAllTime, days: r.days, granularity };
  }

  // ---------------------------------------------------------------- building blocks (mirror the panel's metric functions)

  private async revenueSummary(c: Ctx): Promise<RevenueSummary> {
    const rows = await this.data.revenueBuckets(c.scope, kpiEdges(c.range));
    const k = (m: (i: number[]) => number) => makeKpi(c.range.isAllTime, m);
    return {
      gross: k(flow(rows, (r) => r.net + r.refunds, true)),
      net: k(flow(rows, (r) => r.net, true)),
      refunds: k(flow(rows, (r) => r.refunds, true)),
      paidOrders: k(flow(rows, (r) => r.paidOrders)),
      avgOrderValue: k(mean(rows, (r) => r.net, (r) => r.paidOrders)),
    };
  }

  private async revenueSeries(c: Ctx, buckets: TimeBucket[]): Promise<RevenuePoint[]> {
    const edges = bucketEdges(buckets);
    const [money, placed] = await Promise.all([this.data.revenueBuckets(c.scope, edges), this.data.placedBuckets(c.scope, edges)]);
    return buckets.map((b, i) => {
      const m = money.get(i + 1);
      const net = round2(m?.net ?? 0);
      const refunds = round2(m?.refunds ?? 0);
      return { ...point(b), gross: round2(net + refunds), net, refunds, orders: placed.get(i + 1)?.placed ?? 0, paidOrders: m?.paidOrders ?? 0 };
    });
  }

  private async orderSummary(c: Ctx): Promise<OrderSummary> {
    const [rows, byStatus] = await Promise.all([this.data.placedBuckets(c.scope, kpiEdges(c.range)), this.data.statusCounts(c.scope, c.range)]);
    return {
      placed: makeKpi(c.range.isAllTime, flow(rows, (r) => r.placed)),
      conversion: makeKpi(c.range.isAllTime, ratio(rows, (r) => r.converted, (r) => r.placed)),
      byStatus,
    };
  }

  private async newEnrollments(c: Ctx): Promise<Kpi> {
    const rows = await this.data.enrollmentBuckets(c.scope, kpiEdges(c.range));
    return makeKpi(c.range.isAllTime, flow(rows, (r) => r.n));
  }

  private async enrollmentSeries(c: Ctx, buckets: TimeBucket[]) {
    const rows = await this.data.enrollmentBuckets(c.scope, bucketEdges(buckets));
    return series(buckets, rows, (r) => ({ value: r?.n ?? 0 }));
  }

  /** Distinct active learners: segments + previous come from one query, the whole range from another (distinct isn't additive). */
  private async activeLearners(c: Ctx): Promise<Kpi> {
    const prev = previousRange(c.range);
    const [segments, whole] = await Promise.all([
      this.data.activeLearnerBuckets(c.scope, kpiEdges(c.range)),
      this.data.activeLearnerBuckets(c.scope, [prev.from, c.range.from, new Date(c.range.to.getTime() + 1)]),
    ]);
    const value = whole.get(2)?.n ?? 0;
    const previous = c.range.isAllTime ? 0 : (whole.get(1)?.n ?? 0);
    const kpi = makeKpi(c.range.isAllTime, flow(segments, (r) => r.n));
    return { ...kpi, value, previous, changePct: c.range.isAllTime || previous === 0 ? null : round1(((value - previous) / previous) * 100) };
  }

  private async avgCompletion(c: Ctx): Promise<Kpi> {
    const rows = await this.data.completionRateBuckets(c.scope, kpiEdges(c.range));
    return makeKpi(c.range.isAllTime, stockMean(rows, (r) => r.rateSum, (r) => r.n));
  }

  private async studentSummary(c: Ctx): Promise<StudentSummary> {
    const edges = kpiEdges(c.range);
    const [joins, counts, activeLearners, completion] = await Promise.all([
      this.data.userJoinBuckets(c.scope, STUDENT_ROLE, edges, true),
      this.data.userCounts(c.scope, STUDENT_ROLE, c.range.to),
      this.activeLearners(c),
      this.data.completionRateBuckets(c.scope, edges),
    ]);
    return {
      total: makeKpi(c.range.isAllTime, stock(joins, (r) => r.n)),
      newStudents: makeKpi(c.range.isAllTime, flow(joins, (r) => r.n)),
      activeLearners,
      active: counts.active,
      inactive: counts.total - counts.active,
      avgCompletion: stockMean(completion, (r) => r.rateSum, (r) => r.n)([11]),
    };
  }

  private async studentGrowth(c: Ctx, buckets: TimeBucket[]) {
    const edges = bucketEdges(buckets);
    const [joins, active] = await Promise.all([this.data.userJoinBuckets(c.scope, STUDENT_ROLE, edges, false), this.data.activeLearnerBuckets(c.scope, edges)]);
    return buckets.map((b, i) => ({ ...point(b), newStudents: joins.get(i + 1)?.n ?? 0, activeStudents: active.get(i + 1)?.n ?? 0 }));
  }

  private async completion(c: Ctx) {
    const n = await this.data.completionCounts(c.scope, c.range.to);
    return completionBreakdown(n.completed, n.inProgress, n.stalled);
  }

  private async instructorSummary(c: Ctx) {
    const [joins, counts] = await Promise.all([
      this.data.userJoinBuckets(c.scope, INSTRUCTOR_ROLE, kpiEdges(c.range), true),
      this.data.userCounts(c.scope, INSTRUCTOR_ROLE, c.range.to),
    ]);
    return { active: makeKpi(c.range.isAllTime, stock(joins, (r) => r.active)), total: counts.total, inactive: counts.total - counts.active };
  }

  private async courseSummary(c: Ctx) {
    const [rows, total] = await Promise.all([this.data.publishedCourseBuckets(c.scope, kpiEdges(c.range)), this.data.workspaceCourseCount(c.scope)]);
    return { published: makeKpi(c.range.isAllTime, stock(rows, (r) => r.n)), total };
  }

  private async learningSummary(c: Ctx): Promise<LearningSummary> {
    const edges = kpiEdges(c.range);
    const [quiz, subs, live, certs] = await Promise.all([
      this.data.quizBuckets(c.scope, edges),
      this.data.submissionBuckets(c.scope, edges),
      this.data.liveBuckets(c.scope, edges, c.now),
      this.data.certificateBuckets(c.scope, edges),
    ]);
    const k = (m: (i: number[]) => number) => makeKpi(c.range.isAllTime, m);
    return {
      quizAttempts: k(flow(quiz, (r) => r.attempts)),
      avgQuizScore: k(mean(quiz, (r) => r.scoreSum, (r) => r.scored, 1)),
      quizPassRate: k(ratio(quiz, (r) => r.passed, (r) => r.finished)),
      submissions: k(flow(subs, (r) => r.total)),
      onTimeRate: k(ratio(subs, (r) => r.total - r.late, (r) => r.total)),
      liveSessions: k(flow(live, (r) => r.sessions)),
      attendanceRate: k(ratio(live, (r) => r.attended, (r) => r.seats)),
      certificatesIssued: k(flow(certs, (r) => r.n)),
    };
  }

  private async communitySummary(c: Ctx): Promise<CommunitySummary> {
    const [rows, openReports] = await Promise.all([this.data.communityBuckets(c.scope, kpiEdges(c.range)), this.data.openReports(c.scope)]);
    const k = (f: (r: { threads: number; replies: number; reports: number }) => number) => makeKpi(c.range.isAllTime, flow(rows, f));
    return { threads: k((r) => r.threads), replies: k((r) => r.replies), reports: k((r) => r.reports), openReports };
  }

  private async revenueBreakdown(c: Ctx, by: "method" | "course" | "category", r: DateRange = c.range) {
    return toBreakdown(await this.data.revenueBy(c.scope, r, by));
  }

  private async enrollmentBreakdown(c: Ctx, by: "course" | "category") {
    return toBreakdown(await this.data.enrollmentsBy(c.scope, c.range, by));
  }

  private async recentOrders(c: Ctx, n: number) {
    const rows = await this.data.recentOrders(c.scope, c.range, n);
    return rows.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      studentId: o.studentId,
      studentName: o.studentName,
      ...(o.avatar ? { avatarUrl: o.avatar } : {}),
      course: o.course,
      amount: round2(o.amount),
      status: statusLabel(o.status),
      date: new Date(o.createdAt).toISOString(),
    }));
  }

  private async recentEnrollments(c: Ctx, n: number) {
    const rows = await this.data.recentEnrollments(c.scope, c.range, n);
    return rows.map((e) => ({
      id: e.id,
      orderId: e.orderId,
      studentId: e.studentId,
      studentName: e.studentName,
      ...(e.avatar ? { avatarUrl: e.avatar } : {}),
      courseId: e.courseId,
      course: e.course,
      progress: Math.max(0, Math.min(100, e.progress)),
      enrolledAt: new Date(e.at).toISOString(),
    }));
  }

  /** Local day with the most net revenue, as a one-day RevenuePoint. */
  private async bestDay(c: Ctx): Promise<RevenuePoint | null> {
    const day = await this.data.bestRevenueDay(c.scope, c.range);
    if (!day) return null;
    const from = localToInstant(day, "00:00")!;
    const [p] = await this.revenueSeries(c, buildBuckets({ from, to: new Date(from.getTime() + DAY_MS - 1) }, "day"));
    return p ?? null;
  }

  // ---------------------------------------------------------------- endpoints

  /** Dashboard home: 4 KPI cards, revenue + student growth charts, enrollments by course, completion, recent rows, top courses. */
  async dashboard(actor: AuthUser, q: AnalyticsRangeDto): Promise<DashboardReport> {
    const c = await this.ctx(actor, q);
    const g = autoGranularity(c.range);
    const buckets = buildBuckets(c.range, g);
    const [students, instructors, courses, revenue, revenueSeries, growth, byCourse, completion, recentOrders, recentEnrollments, courseStats] = await Promise.all([
      this.studentSummary(c),
      this.instructorSummary(c),
      this.courseSummary(c),
      this.revenueSummary(c),
      this.revenueSeries(c, buckets),
      this.studentGrowth(c, buckets),
      this.enrollmentBreakdown(c, "course"),
      this.completion(c),
      this.recentOrders(c, LIMITS.dashboardRows),
      this.recentEnrollments(c, LIMITS.dashboardRows),
      this.data.courseStats(c.scope, c.range),
    ]);
    return {
      range: this.meta(c, g),
      currency: c.currency,
      kpis: { totalStudents: students.total, activeInstructors: instructors.active, publishedCourses: courses.published, totalRevenue: revenue.net },
      revenue: revenueSeries,
      growth,
      enrollmentsByCourse: byCourse.slice(0, LIMITS.dashboardCourses),
      completion,
      recentOrders,
      recentEnrollments,
      topCourses: rankCourses(courseStats.map(stripInstructor), "revenue", LIMITS.dashboardCourses),
    };
  }

  /** Analytics › Overview: 8 KPIs, revenue + enrollments combo, highlights. */
  async overview(actor: AuthUser, q: AnalyticsRangeDto): Promise<OverviewReport> {
    const c = await this.ctx(actor, q);
    const g = autoGranularity(c.range);
    const buckets = buildBuckets(c.range, g);
    const [revenue, orders, newEnrollments, activeLearners, avgCompletion, learning, rev, enr, courseStats, byMethod, byCategory, bestDay] = await Promise.all([
      this.revenueSummary(c),
      this.orderSummary(c),
      this.newEnrollments(c),
      this.activeLearners(c),
      this.avgCompletion(c),
      this.learningSummary(c),
      this.revenueSeries(c, buckets),
      this.enrollmentSeries(c, buckets),
      this.data.courseStats(c.scope, c.range),
      this.revenueBreakdown(c, "method"),
      this.enrollmentBreakdown(c, "category"),
      this.bestDay(c),
    ]);
    const kpis = {
      netRevenue: revenue.net,
      orders: orders.placed,
      conversion: orders.conversion,
      newEnrollments,
      activeLearners,
      avgCompletion,
      certificates: learning.certificatesIssued,
      quizPassRate: learning.quizPassRate,
    };
    return {
      range: this.meta(c, g),
      currency: c.currency,
      kpis,
      combo: rev.map((p, i) => ({ ...p, enrollments: enr[i]?.value ?? 0 })),
      highlights: {
        bestCourse: rankCourses(courseStats.map(stripInstructor), "revenue", 1)[0] ?? null,
        bestDay,
        biggestChange: biggestChange(kpis),
        topMethod: byMethod[0] ?? null,
        topCategory: byCategory[0] ?? null,
      },
    };
  }

  /** Analytics › Revenue. */
  async revenue(actor: AuthUser, q: RevenueReportQueryDto): Promise<RevenueReport> {
    const c = await this.ctx(actor, q, { advanced: true });
    const g = resolveGranularity(c.range, q.granularity);
    const [summary, seriesPoints, byMethod, byCategory, current, previous, orders] = await Promise.all([
      this.revenueSummary(c),
      this.revenueSeries(c, buildBuckets(c.range, g)),
      this.revenueBreakdown(c, "method"),
      this.revenueBreakdown(c, "category"),
      this.revenueBreakdown(c, "course"),
      c.range.isAllTime ? Promise.resolve([]) : this.revenueBreakdown(c, "course", previousRange(c.range)),
      this.orderSummary(c),
    ]);
    return {
      range: this.meta(c, g),
      currency: c.currency,
      summary,
      series: seriesPoints,
      granularity: g,
      granularityOptions: granularityOptions(c.range),
      byMethod,
      byCategory,
      byCourse: withChange(current, previous, c.range.isAllTime),
      orders,
    };
  }

  /** Analytics › Students. */
  async students(actor: AuthUser, q: StudentsReportQueryDto): Promise<StudentsReport> {
    const c = await this.ctx(actor, q, { advanced: true });
    const g = autoGranularity(c.range);
    const buckets = buildBuckets(c.range, g);
    const studentRank = q.studentRank ?? "completion";
    const [summary, avgCompletion, growth, retention, completion, byCategory, top] = await Promise.all([
      this.studentSummary(c),
      this.avgCompletion(c),
      this.studentGrowth(c, buckets),
      this.data.retentionBuckets(c.scope, bucketEdges(buckets, true)),
      this.completion(c),
      this.enrollmentBreakdown(c, "category"),
      this.data.topStudents(c.scope, c.range, studentRank, LIMITS.topStudents),
    ]);
    const last = await this.data.lastActive(c.scope, c.range, top.map((s) => s.id));
    return {
      range: this.meta(c, g),
      currency: c.currency,
      summary,
      avgCompletion,
      growth,
      retention: retentionPoints(buckets, retention),
      completion,
      byCategory,
      topStudents: top.map((s) => ({
        studentId: s.id,
        name: s.name,
        email: s.email,
        ...(s.avatar ? { avatarUrl: s.avatar } : {}),
        status: s.status === "ACTIVE" ? "Active" : s.status === "BLOCKED" ? "Suspended" : "Inactive",
        enrolled: s.enrolled,
        completed: s.completed,
        avgScore: s.avgScore,
        completionRate: s.completionRate,
        spent: round2(s.spent),
        lastActiveAt: last.get(s.id)?.toISOString() ?? null,
      })),
      studentRank,
    };
  }

  /** Analytics › Courses. */
  async courses(actor: AuthUser, q: CoursesReportQueryDto): Promise<CoursesReport> {
    const c = await this.ctx(actor, q, { advanced: true });
    const instructorRank = q.instructorRank ?? "revenue";
    const [courses, enrollments, revenue, instructors, courseStats, byCourse] = await Promise.all([
      this.courseSummary(c),
      this.newEnrollments(c),
      this.revenueSummary(c),
      this.instructorSummary(c),
      this.data.courseStats(c.scope, c.range),
      this.enrollmentBreakdown(c, "course"),
    ]);
    return {
      range: this.meta(c, autoGranularity(c.range)),
      currency: c.currency,
      courses,
      enrollments,
      revenue: revenue.net,
      instructors,
      topCourses: rankCourses(courseStats.map(stripInstructor), "enrollments", LIMITS.coursesTable),
      byCourse,
      leaderboard: rankInstructors(courseStats, instructorRank, LIMITS.leaderboard),
      instructorRank,
    };
  }

  /** Analytics › Engagement. */
  async engagement(actor: AuthUser, q: AnalyticsRangeDto): Promise<EngagementReport> {
    const c = await this.ctx(actor, q, { advanced: true });
    const g = autoGranularity(c.range);
    const buckets = buildBuckets(c.range, g);
    const edges = bucketEdges(buckets);
    const [learning, community, quiz, quizzes, subs, assignments, live, certs, comm] = await Promise.all([
      this.learningSummary(c),
      this.communitySummary(c),
      this.data.quizBuckets(c.scope, edges),
      this.data.quizPerformance(c.scope, c.range, LIMITS.performanceRows),
      this.data.submissionBuckets(c.scope, edges),
      this.data.assignmentPerformance(c.scope, c.range, LIMITS.performanceRows),
      this.data.liveBuckets(c.scope, edges, c.now),
      this.data.certificateBuckets(c.scope, edges),
      this.data.communityBuckets(c.scope, edges),
    ]);
    return {
      range: this.meta(c, g),
      currency: c.currency,
      learning,
      community,
      quizSeries: series(buckets, quiz, (r) => ({ attempts: r?.attempts ?? 0, passed: r?.passed ?? 0, failed: r?.failed ?? 0, unfinished: r?.unfinished ?? 0 })),
      quizzes: quizzes.map((x) => ({
        quizId: x.quizId,
        title: x.title ?? "Deleted quiz",
        courseId: x.courseId ?? "",
        attempts: x.attempts,
        finished: x.finished,
        avgScore: x.scored ? round1(x.scoreSum / x.scored) : 0,
        passRate: pctOf(x.passed, x.finished),
      })),
      submissionSeries: series(buckets, subs, (r) => ({ total: r?.total ?? 0, onTime: (r?.total ?? 0) - (r?.late ?? 0), late: r?.late ?? 0 })),
      assignments: assignments.map((a) => ({
        assignmentId: a.assignmentId,
        title: a.title,
        courseId: a.courseId,
        submissions: a.submissions,
        late: a.late,
        onTimeRate: pctOf(a.submissions - a.late, a.submissions),
        graded: a.graded,
        avgScore: a.graded ? round1(a.scoreSum / a.graded) : null,
      })),
      liveSeries: series(buckets, live, (r) => {
        const seats = r?.seats ?? 0;
        const attended = r?.attended ?? 0;
        return { sessions: r?.sessions ?? 0, seats, attended, absent: seats - attended, attendanceRate: pctOf(attended, seats) };
      }),
      certificateSeries: series(buckets, certs, (r) => ({ value: r?.n ?? 0 })),
      communitySeries: series(buckets, comm, (r) => ({ threads: r?.threads ?? 0, replies: r?.replies ?? 0, reports: r?.reports ?? 0 })),
    };
  }
}

/** Course rows without the instructor join columns (API shape). */
function stripInstructor<T extends { instructorId: string; instructorAvatar: string | null }>(row: T): Omit<T, "instructorId" | "instructorAvatar"> {
  const { instructorId: _id, instructorAvatar: _avatar, ...rest } = row;
  return rest;
}

