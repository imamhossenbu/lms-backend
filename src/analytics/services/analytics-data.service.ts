import { Injectable } from "@nestjs/common";
import { Prisma } from "../../../generated/prisma";
import { statusLabel, type OrderStatusLabel } from "../../commerce/order-status";
import { PrismaService } from "../../prisma/prisma.service";
import { WORKSPACE_UTC_OFFSET_MINUTES } from "../../common/workspace-time";
import type { Buckets } from "../analytics-metrics";
import { round1, round2 } from "../analytics-metrics";
import {
  ACTIVE_USER_STATUS,
  ATTENDED_STATUSES,
  CANCELLED_LIVE_STATUS,
  INSTRUCTOR_ROLE,
  LEGACY_PAYMENT_METHOD,
  PAID_STATUSES,
  PUBLISHED_COURSE_STATUS,
  REFUNDED_STATUSES,
  STUDENT_ROLE,
} from "../analytics.constants";
import type { CourseRow, DateRange, StudentRankBy } from "../analytics.types";

/** Workspace scope: `institutionId` of the signed-in admin (null = legacy single-tenant data). */
export type Scope = string | null;

const ts = (d: Date) => Prisma.sql`${d.toISOString()}::timestamp`;
const tsArray = (edges: Date[]) => Prisma.sql`${edges.map((e) => e.toISOString())}::timestamp[]`;
const inList = (values: readonly string[]) => Prisma.join(values.map((v) => Prisma.sql`${v}`));
const tenant = (column: Prisma.Sql, scope: Scope) => Prisma.sql`${column} IS NOT DISTINCT FROM ${scope}::text`;

export type CourseStatRow = CourseRow & { instructorId: string; instructorAvatar: string | null };

/**
 * Read-only SQL for analytics. Every query is tenant-scoped:
 *  - students / instructors / orders / enrollments / learner activity through `User.institutionId`;
 *  - quizzes, assignments, live classes, certificates, community through their own `institutionId`;
 *  - courses are GLOBAL: course-level numbers only count the workspace's enrollments and orders, and the
 *    course universe is "taught by a workspace instructor, or enrolled / bought by a workspace student".
 * Aggregation happens in Postgres (`width_bucket` over threshold arrays, GROUP BY, FILTER) — no table loads.
 * Raw queries use tagged templates only (values are always bound parameters).
 */
@Injectable()
export class AnalyticsDataService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------- sources (each exposes an `at` column)

  /** Scoped, not deleted users of one role. */
  private users(scope: Scope, role: string) {
    return Prisma.sql`SELECT u.id, u.name, u.email, u.avatar, u.status, u."createdAt" AS at FROM "User" u
      WHERE u.role = ${role} AND u."deletedAt" IS NULL AND ${tenant(Prisma.sql`u."institutionId"`, scope)}`;
  }

  /** Orders of the workspace's users, with lifecycle flags and payment date. */
  private orders(scope: Scope) {
    return Prisma.sql`SELECT o.id, o."orderNumber", o."userId", o."courseId", o."createdAt", COALESCE(o."paidAt", o."createdAt") AS "paidAt",
        o."totalAmount"::float8 AS amount, COALESCE(o."paymentMethod", ${LEGACY_PAYMENT_METHOD}) AS method, o.status,
        (o.status IN (${inList(PAID_STATUSES)})) AS paid, (o.status IN (${inList(REFUNDED_STATUSES)})) AS refunded
      FROM "Order" o JOIN "User" u ON u.id = o."userId" WHERE ${tenant(Prisma.sql`u."institutionId"`, scope)}`;
  }

  /** Enrollments of the workspace's students. */
  private enrollments(scope: Scope) {
    return Prisma.sql`SELECT e.id, e."userId", e."courseId", e."enrolledAt" AS at, e."progressPercentage" AS progress,
        (e."completedAt" IS NOT NULL OR e."progressPercentage" >= 100) AS completed, u.status AS "userStatus", u."createdAt" AS "joinedAt"
      FROM "Enrollment" e JOIN "User" u ON u.id = e."userId"
      WHERE u.role = ${STUDENT_ROLE} AND u."deletedAt" IS NULL AND ${tenant(Prisma.sql`u."institutionId"`, scope)}`;
  }

  /**
   * Timestamped learner activity of the workspace's students: orders placed, quiz attempts, assignment submissions,
   * attended live classes (not cancelled), community threads / replies and completed lessons.
   */
  private activity(scope: Scope) {
    return Prisma.sql`SELECT x.uid, x.at FROM (
        SELECT o."userId" AS uid, o."createdAt" AS at FROM "Order" o
        UNION ALL SELECT a."userId", a."submittedAt" FROM "QuizAttempt" a
        UNION ALL SELECT s."userId", s."submittedAt" FROM "AssignmentSubmission" s
        UNION ALL SELECT t."userId", c."startTime" FROM "Attendance" t JOIN "LiveClass" c ON c.id = t."liveClassId"
          WHERE c.status <> ${CANCELLED_LIVE_STATUS} AND t.status IN (${inList(ATTENDED_STATUSES)})
        UNION ALL SELECT d."userId", d."createdAt" FROM "Discussion" d
        UNION ALL SELECT r."userId", r."createdAt" FROM "DiscussionReply" r
        UNION ALL SELECT p."userId", p."completedAt" FROM "LessonProgress" p WHERE p."completedAt" IS NOT NULL
      ) x JOIN "User" u ON u.id = x.uid
      WHERE u.role = ${STUDENT_ROLE} AND u."deletedAt" IS NULL AND ${tenant(Prisma.sql`u."institutionId"`, scope)}`;
  }

  /** Courses that belong to the workspace (taught by its instructors, or enrolled / bought by its students). */
  private workspaceCourses(scope: Scope) {
    return Prisma.sql`SELECT c.id FROM "Course" c JOIN "User" i ON i.id = c."instructorId" WHERE ${tenant(Prisma.sql`i."institutionId"`, scope)}
      UNION SELECT e."courseId" FROM (${this.enrollments(scope)}) e
      UNION SELECT o."courseId" FROM (${this.orders(scope)}) o`;
  }

  /**
   * `SELECT width_bucket(at, edges) AS b, <aggs> FROM (<source>) s … GROUP BY b`.
   * `cumulative` drops the lower bound so bucket 0 holds everything before edges[0] (stock metrics).
   */
  private async bucketed<T>(source: Prisma.Sql, aggs: Prisma.Sql, edges: Date[], cumulative = false): Promise<Buckets<T>> {
    if (edges.length < 2) return new Map();
    const lower = cumulative ? Prisma.empty : Prisma.sql`AND s.at >= ${ts(edges[0])}`;
    const rows = await this.prisma.$queryRaw<(T & { b: number })[]>(Prisma.sql`
      SELECT width_bucket(s.at, ${tsArray(edges)})::int AS b, ${aggs}
      FROM (${source}) s WHERE s.at < ${ts(edges[edges.length - 1])} ${lower} GROUP BY 1`);
    return new Map(rows.map((r) => [r.b, r]));
  }

  // ---------------------------------------------------------------- workspace facts

  async currency(scope: Scope): Promise<string | null> {
    const row = await this.prisma.workspaceSettings.findUnique({ where: { scopeKey: scope ?? "legacy" }, select: { general: true } });
    const general = row?.general as { currency?: unknown } | null | undefined;
    return typeof general?.currency === "string" && general.currency ? general.currency : null;
  }

  async planFeatures(institutionId: string): Promise<{ plan: string; features: string[] } | null> {
    const inst = await this.prisma.institution.findUnique({ where: { id: institutionId }, select: { plan: { select: { name: true, features: true } } } });
    return inst ? { plan: inst.plan.name, features: inst.plan.features } : null;
  }

  /** First data day (earliest order or student join); null when the workspace has neither. */
  async dataStart(scope: Scope): Promise<Date | null> {
    const [row] = await this.prisma.$queryRaw<{ at: Date | null }[]>(Prisma.sql`
      SELECT LEAST((SELECT MIN(o."createdAt") FROM (${this.orders(scope)}) o), (SELECT MIN(s.at) FROM (${this.users(scope, STUDENT_ROLE)}) s)) AS at`);
    return row?.at ? new Date(row.at) : null;
  }

  // ---------------------------------------------------------------- revenue & orders

  /** Paid / refunded money by payment date. */
  revenueBuckets(scope: Scope, edges: Date[]) {
    return this.bucketed<{ net: number; refunds: number; paidOrders: number }>(
      Prisma.sql`SELECT o."paidAt" AS at, o.amount, o.paid, o.refunded FROM (${this.orders(scope)}) o WHERE o.paid OR o.refunded`,
      Prisma.sql`COALESCE(SUM(s.amount) FILTER (WHERE s.paid), 0)::float8 AS net, COALESCE(SUM(s.amount) FILTER (WHERE s.refunded), 0)::float8 AS refunds,
        (COUNT(*) FILTER (WHERE s.paid))::int AS "paidOrders"`,
      edges,
    );
  }

  /** Orders placed (any status) and converted (Paid + Refunded) by created date. */
  placedBuckets(scope: Scope, edges: Date[]) {
    return this.bucketed<{ placed: number; converted: number }>(
      Prisma.sql`SELECT o."createdAt" AS at, (o.paid OR o.refunded) AS converted FROM (${this.orders(scope)}) o`,
      Prisma.sql`COUNT(*)::int AS placed, (COUNT(*) FILTER (WHERE s.converted))::int AS converted`,
      edges,
    );
  }

  async statusCounts(scope: Scope, r: DateRange): Promise<Record<OrderStatusLabel, number>> {
    const rows = await this.prisma.$queryRaw<{ status: string; n: number }[]>(Prisma.sql`
      SELECT o.status, COUNT(*)::int AS n FROM (${this.orders(scope)}) o
      WHERE o."createdAt" >= ${ts(r.from)} AND o."createdAt" <= ${ts(r.to)} GROUP BY o.status`);
    const out: Record<OrderStatusLabel, number> = { Paid: 0, Pending: 0, Failed: 0, Cancelled: 0, Refunded: 0 };
    rows.forEach((row) => (out[statusLabel(row.status)] += row.n));
    return out;
  }

  /** Net revenue grouped by payment method / course / category for a window. */
  async revenueBy(scope: Scope, r: DateRange, by: "method" | "course" | "category") {
    const group =
      by === "method"
        ? Prisma.sql`o.method AS key, o.method AS label`
        : by === "course"
          ? Prisma.sql`c.id AS key, c.title AS label`
          : Prisma.sql`COALESCE(cat.id, 'other') AS key, COALESCE(cat.name, 'Other') AS label`;
    const rows = await this.prisma.$queryRaw<{ key: string; label: string; value: number; count: number }[]>(Prisma.sql`
      SELECT ${group}, COALESCE(SUM(o.amount), 0)::float8 AS value, COUNT(*)::int AS count
      FROM (${this.orders(scope)}) o JOIN "Course" c ON c.id = o."courseId" LEFT JOIN "Category" cat ON cat.id = c."categoryId"
      WHERE o.paid AND o."paidAt" >= ${ts(r.from)} AND o."paidAt" <= ${ts(r.to)} GROUP BY 1, 2`);
    return rows;
  }

  /** Local day with the highest net revenue in the window (null when nothing was paid). */
  async bestRevenueDay(scope: Scope, r: DateRange): Promise<string | null> {
    const [row] = await this.prisma.$queryRaw<{ day: string }[]>(Prisma.sql`
      SELECT to_char(o."paidAt" + make_interval(mins => ${WORKSPACE_UTC_OFFSET_MINUTES}::int), 'YYYY-MM-DD') AS day, SUM(o.amount) AS net
      FROM (${this.orders(scope)}) o WHERE o.paid AND o."paidAt" >= ${ts(r.from)} AND o."paidAt" <= ${ts(r.to)}
      GROUP BY 1 HAVING SUM(o.amount) > 0 ORDER BY net DESC, day ASC LIMIT 1`);
    return row?.day ?? null;
  }

  // ---------------------------------------------------------------- enrollments, students, instructors, courses

  enrollmentBuckets(scope: Scope, edges: Date[]) {
    return this.bucketed<{ n: number }>(this.enrollments(scope), Prisma.sql`COUNT(*)::int AS n`, edges);
  }

  async enrollmentsBy(scope: Scope, r: DateRange, by: "course" | "category") {
    const group = by === "course" ? Prisma.sql`c.id AS key, c.title AS label` : Prisma.sql`COALESCE(cat.id, 'other') AS key, COALESCE(cat.name, 'Other') AS label`;
    const rows = await this.prisma.$queryRaw<{ key: string; label: string; n: number }[]>(Prisma.sql`
      SELECT ${group}, COUNT(*)::int AS n FROM (${this.enrollments(scope)}) e
      JOIN "Course" c ON c.id = e."courseId" LEFT JOIN "Category" cat ON cat.id = c."categoryId"
      WHERE e.at >= ${ts(r.from)} AND e.at <= ${ts(r.to)} GROUP BY 1, 2`);
    return rows.map((row) => ({ key: row.key, label: row.label, value: row.n, count: row.n }));
  }

  /** Students by join date (cumulative-capable): all, and currently Active. */
  userJoinBuckets(scope: Scope, role: typeof STUDENT_ROLE | typeof INSTRUCTOR_ROLE, edges: Date[], cumulative: boolean) {
    return this.bucketed<{ n: number; active: number }>(
      this.users(scope, role),
      Prisma.sql`COUNT(*)::int AS n, (COUNT(*) FILTER (WHERE s.status = ${ACTIVE_USER_STATUS}))::int AS active`,
      edges,
      cumulative,
    );
  }

  /** Users of a role joined by `to`: total and Active. */
  async userCounts(scope: Scope, role: string, to: Date): Promise<{ total: number; active: number }> {
    const [row] = await this.prisma.$queryRaw<{ total: number; active: number }[]>(Prisma.sql`
      SELECT COUNT(*)::int AS total, (COUNT(*) FILTER (WHERE s.status = ${ACTIVE_USER_STATUS}))::int AS active
      FROM (${this.users(scope, role)}) s WHERE s.at <= ${ts(to)}`);
    return row ?? { total: 0, active: 0 };
  }

  /** Per-student completion rate (completed / enrolled courses, rounded %; 0 without enrollments) by join date, cumulative. */
  completionRateBuckets(scope: Scope, edges: Date[]) {
    return this.bucketed<{ n: number; rateSum: number }>(
      Prisma.sql`SELECT st.at, CASE WHEN COUNT(e.id) > 0 THEN ROUND((COUNT(e.id) FILTER (WHERE e."completedAt" IS NOT NULL OR e."progressPercentage" >= 100))::numeric * 100 / COUNT(e.id)) ELSE 0 END AS rate
        FROM (${this.users(scope, STUDENT_ROLE)}) st LEFT JOIN "Enrollment" e ON e."userId" = st.id GROUP BY st.id, st.at`,
      Prisma.sql`COUNT(*)::int AS n, COALESCE(SUM(s.rate), 0)::float8 AS "rateSum"`,
      edges,
      true,
    );
  }

  /** Course seats of students joined by `to`: completed / open (Active student) / open (other). */
  async completionCounts(scope: Scope, to: Date): Promise<{ completed: number; inProgress: number; stalled: number }> {
    const [row] = await this.prisma.$queryRaw<{ completed: number; inProgress: number; stalled: number }[]>(Prisma.sql`
      SELECT (COUNT(*) FILTER (WHERE e.completed))::int AS completed,
        (COUNT(*) FILTER (WHERE NOT e.completed AND e."userStatus" = ${ACTIVE_USER_STATUS}))::int AS "inProgress",
        (COUNT(*) FILTER (WHERE NOT e.completed AND e."userStatus" <> ${ACTIVE_USER_STATUS}))::int AS stalled
      FROM (${this.enrollments(scope)}) e WHERE e."joinedAt" <= ${ts(to)}`);
    return row ?? { completed: 0, inProgress: 0, stalled: 0 };
  }

  /** Distinct active learners per bucket. */
  activeLearnerBuckets(scope: Scope, edges: Date[]) {
    return this.bucketed<{ n: number }>(this.activity(scope), Prisma.sql`COUNT(DISTINCT s.uid)::int AS n`, edges);
  }

  /** Distinct active learners per bucket and how many of them were also active in the bucket before. */
  async retentionBuckets(scope: Scope, edges: Date[]): Promise<Buckets<{ active: number; returning: number }>> {
    if (edges.length < 2) return new Map();
    const rows = await this.prisma.$queryRaw<{ b: number; active: number; returning: number }[]>(Prisma.sql`
      WITH a AS (
        SELECT DISTINCT s.uid, width_bucket(s.at, ${tsArray(edges)})::int AS b FROM (${this.activity(scope)}) s
        WHERE s.at >= ${ts(edges[0])} AND s.at < ${ts(edges[edges.length - 1])}
      )
      SELECT cur.b, COUNT(*)::int AS active, COUNT(prev.uid)::int AS returning
      FROM a cur LEFT JOIN a prev ON prev.uid = cur.uid AND prev.b = cur.b - 1 GROUP BY cur.b`);
    return new Map(rows.map((r) => [r.b, r]));
  }

  /** Published workspace courses by their first workspace enrollment (cumulative) + all workspace courses. */
  publishedCourseBuckets(scope: Scope, edges: Date[]) {
    return this.bucketed<{ n: number }>(
      Prisma.sql`SELECT MIN(e.at) AS at FROM (${this.enrollments(scope)}) e JOIN "Course" c ON c.id = e."courseId"
        WHERE c.status = ${PUBLISHED_COURSE_STATUS} GROUP BY e."courseId"`,
      Prisma.sql`COUNT(*)::int AS n`,
      edges,
      true,
    );
  }

  async workspaceCourseCount(scope: Scope): Promise<number> {
    const [row] = await this.prisma.$queryRaw<{ n: number }[]>(Prisma.sql`SELECT COUNT(*)::int AS n FROM (${this.workspaceCourses(scope)}) w`);
    return row?.n ?? 0;
  }

  /**
   * Per-course numbers for the window: new enrollments, net revenue (Paid orders by payment date), average
   * progress of the course's workspace enrollments (all time; null when none) and the course rating.
   * Only courses with enrollments or revenue in the window.
   */
  async courseStats(scope: Scope, r: DateRange): Promise<CourseStatRow[]> {
    const rows = await this.prisma.$queryRaw<
      {
        id: string;
        title: string;
        thumbnail: string | null;
        price: number;
        rating: number;
        category: string | null;
        instructorId: string;
        instructor: string;
        instructorAvatar: string | null;
        enrollments: number;
        revenue: number;
        completion: number | null;
      }[]
    >(Prisma.sql`
      WITH enr AS (SELECT e."courseId", COUNT(*)::int AS n FROM (${this.enrollments(scope)}) e WHERE e.at >= ${ts(r.from)} AND e.at <= ${ts(r.to)} GROUP BY 1),
           rev AS (SELECT o."courseId", SUM(o.amount)::float8 AS v FROM (${this.orders(scope)}) o WHERE o.paid AND o."paidAt" >= ${ts(r.from)} AND o."paidAt" <= ${ts(r.to)} GROUP BY 1),
           ids AS (SELECT "courseId" FROM enr UNION SELECT "courseId" FROM rev),
           prog AS (SELECT e."courseId", AVG(e.progress)::float8 AS p FROM (${this.enrollments(scope)}) e WHERE e."courseId" IN (SELECT "courseId" FROM ids) GROUP BY 1)
      SELECT c.id, c.title, c.thumbnail, c.price::float8 AS price, c."ratingAverage"::float8 AS rating, cat.name AS category,
        i.id AS "instructorId", i.name AS instructor, i.avatar AS "instructorAvatar",
        COALESCE(enr.n, 0)::int AS enrollments, COALESCE(rev.v, 0)::float8 AS revenue, prog.p AS completion
      FROM ids JOIN "Course" c ON c.id = ids."courseId" JOIN "User" i ON i.id = c."instructorId"
      LEFT JOIN "Category" cat ON cat.id = c."categoryId"
      LEFT JOIN enr ON enr."courseId" = c.id LEFT JOIN rev ON rev."courseId" = c.id LEFT JOIN prog ON prog."courseId" = c.id`);
    return rows.map((c) => ({
      courseId: c.id,
      title: c.title,
      instructor: c.instructor,
      category: c.category ?? "Other",
      thumbnailUrl: c.thumbnail ?? "",
      price: round2(c.price),
      enrollments: c.enrollments,
      revenue: round2(c.revenue),
      completionPct: c.completion === null ? null : Math.round(c.completion),
      rating: c.rating > 0 ? round1(c.rating) : null,
      instructorId: c.instructorId,
      instructorAvatar: c.instructorAvatar,
    }));
  }

  // ---------------------------------------------------------------- recent rows

  async recentOrders(scope: Scope, r: DateRange, n: number) {
    return this.prisma.$queryRaw<
      { id: string; orderNumber: string; studentId: string; studentName: string; avatar: string | null; course: string; amount: number; status: string; createdAt: Date }[]
    >(Prisma.sql`
      SELECT o.id, o."orderNumber", u.id AS "studentId", u.name AS "studentName", u.avatar, c.title AS course, o.amount, o.status, o."createdAt"
      FROM (${this.orders(scope)}) o JOIN "User" u ON u.id = o."userId" JOIN "Course" c ON c.id = o."courseId"
      WHERE o."createdAt" >= ${ts(r.from)} AND o."createdAt" <= ${ts(r.to)} ORDER BY o."createdAt" DESC, o.id LIMIT ${n}::int`);
  }

  async recentEnrollments(scope: Scope, r: DateRange, n: number) {
    return this.prisma.$queryRaw<
      { id: string; orderId: string | null; studentId: string; studentName: string; avatar: string | null; courseId: string; course: string; progress: number; at: Date }[]
    >(Prisma.sql`
      SELECT e.id, (SELECT o.id FROM "Order" o WHERE o."userId" = e."userId" AND o."courseId" = e."courseId" AND o.status IN (${inList(PAID_STATUSES)})
                    ORDER BY COALESCE(o."paidAt", o."createdAt") DESC LIMIT 1) AS "orderId",
        u.id AS "studentId", u.name AS "studentName", u.avatar, c.id AS "courseId", c.title AS course, e.progress, e.at
      FROM (${this.enrollments(scope)}) e JOIN "User" u ON u.id = e."userId" JOIN "Course" c ON c.id = e."courseId"
      WHERE e.at >= ${ts(r.from)} AND e.at <= ${ts(r.to)} ORDER BY e.at DESC, e.id LIMIT ${n}::int`);
  }

  // ---------------------------------------------------------------- students leaderboard

  /** Students joined by r.to ranked by completion rate / average best quiz score / Paid spend in the window. */
  async topStudents(scope: Scope, r: DateRange, by: StudentRankBy, n: number) {
    const order =
      by === "spent"
        ? Prisma.sql`spent DESC, "completionRate" DESC, "avgScore" DESC`
        : by === "score"
          ? Prisma.sql`"avgScore" DESC, "completionRate" DESC`
          : Prisma.sql`"completionRate" DESC, "avgScore" DESC`;
    return this.prisma.$queryRaw<
      { id: string; name: string; email: string; avatar: string | null; status: string; enrolled: number; completed: number; avgScore: number; completionRate: number; spent: number }[]
    >(Prisma.sql`
      WITH st AS (SELECT * FROM (${this.users(scope, STUDENT_ROLE)}) s WHERE s.at <= ${ts(r.to)}),
        enr AS (SELECT e."userId", COUNT(*)::int AS enrolled, (COUNT(*) FILTER (WHERE e."completedAt" IS NOT NULL OR e."progressPercentage" >= 100))::int AS completed
                FROM "Enrollment" e JOIN st ON st.id = e."userId" GROUP BY 1),
        best AS (SELECT a."userId", a."quizId", MAX(a.percentage)::float8 AS p FROM "QuizAttempt" a JOIN st ON st.id = a."userId" GROUP BY 1, 2),
        sc AS (SELECT "userId", ROUND(AVG(p))::int AS score FROM best GROUP BY 1),
        sp AS (SELECT o."userId", SUM(o."totalAmount")::float8 AS spent FROM "Order" o JOIN st ON st.id = o."userId"
               WHERE o.status IN (${inList(PAID_STATUSES)}) AND COALESCE(o."paidAt", o."createdAt") >= ${ts(r.from)} AND COALESCE(o."paidAt", o."createdAt") <= ${ts(r.to)} GROUP BY 1)
      SELECT st.id, st.name, st.email, st.avatar, st.status, COALESCE(enr.enrolled, 0)::int AS enrolled, LEAST(COALESCE(enr.completed, 0), COALESCE(enr.enrolled, 0))::int AS completed,
        COALESCE(sc.score, 0)::int AS "avgScore",
        (CASE WHEN COALESCE(enr.enrolled, 0) > 0 THEN ROUND(enr.completed::numeric * 100 / enr.enrolled) ELSE 0 END)::int AS "completionRate",
        COALESCE(sp.spent, 0)::float8 AS spent
      FROM st LEFT JOIN enr ON enr."userId" = st.id LEFT JOIN sc ON sc."userId" = st.id LEFT JOIN sp ON sp."userId" = st.id
      ORDER BY ${order}, st.name ASC LIMIT ${n}::int`);
  }

  /** Latest activity in the window per student. */
  async lastActive(scope: Scope, r: DateRange, studentIds: string[]): Promise<Map<string, Date>> {
    if (studentIds.length === 0) return new Map();
    const rows = await this.prisma.$queryRaw<{ uid: string; at: Date }[]>(Prisma.sql`
      SELECT s.uid, MAX(s.at) AS at FROM (${this.activity(scope)}) s
      WHERE s.uid IN (${inList(studentIds)}) AND s.at >= ${ts(r.from)} AND s.at <= ${ts(r.to)} GROUP BY 1`);
    return new Map(rows.map((row) => [row.uid, new Date(row.at)]));
  }

  // ---------------------------------------------------------------- learning

  private quizAttempts(scope: Scope) {
    return Prisma.sql`SELECT a."submittedAt" AS at, a."quizId", a.completed, a.passed,
        CASE WHEN COALESCE(NULLIF(a."totalMarks", 0), q."totalMarks") > 0 THEN a.score::float8 * 100 / COALESCE(NULLIF(a."totalMarks", 0), q."totalMarks") END AS pct
      FROM "QuizAttempt" a JOIN "Quiz" q ON q.id = a."quizId" WHERE ${tenant(Prisma.sql`q."institutionId"`, scope)}`;
  }

  private static readonly QUIZ_AGGS = Prisma.sql`COUNT(*)::int AS attempts, (COUNT(*) FILTER (WHERE s.completed))::int AS finished,
    (COUNT(*) FILTER (WHERE s.completed AND s.passed))::int AS passed, (COUNT(*) FILTER (WHERE s.completed AND NOT s.passed))::int AS failed,
    (COUNT(*) FILTER (WHERE NOT s.completed))::int AS unfinished, (COUNT(*) FILTER (WHERE s.completed AND s.pct IS NOT NULL))::int AS scored,
    COALESCE(SUM(s.pct) FILTER (WHERE s.completed), 0)::float8 AS "scoreSum"`;

  quizBuckets(scope: Scope, edges: Date[]) {
    return this.bucketed<{ attempts: number; finished: number; passed: number; failed: number; unfinished: number; scored: number; scoreSum: number }>(
      this.quizAttempts(scope),
      AnalyticsDataService.QUIZ_AGGS,
      edges,
    );
  }

  async quizPerformance(scope: Scope, r: DateRange, n: number) {
    return this.prisma.$queryRaw<{ quizId: string; title: string | null; courseId: string | null; attempts: number; finished: number; passed: number; scored: number; scoreSum: number }[]>(
      Prisma.sql`
      SELECT s."quizId", q.title, q."courseId", ${AnalyticsDataService.QUIZ_AGGS}
      FROM (${this.quizAttempts(scope)}) s LEFT JOIN "Quiz" q ON q.id = s."quizId"
      WHERE s.at >= ${ts(r.from)} AND s.at <= ${ts(r.to)} GROUP BY s."quizId", q.title, q."courseId"
      ORDER BY attempts DESC, q.title ASC LIMIT ${n}::int`,
    );
  }

  private submissions(scope: Scope) {
    return Prisma.sql`SELECT s."submittedAt" AS at, s."assignmentId", s."isLate" AS late,
        CASE WHEN s."marksObtained" IS NOT NULL AND a.marks > 0 THEN s."marksObtained" * 100 / a.marks END AS pct
      FROM "AssignmentSubmission" s JOIN "Assignment" a ON a.id = s."assignmentId" WHERE ${tenant(Prisma.sql`a."institutionId"`, scope)}`;
  }

  submissionBuckets(scope: Scope, edges: Date[]) {
    return this.bucketed<{ total: number; late: number }>(
      this.submissions(scope),
      Prisma.sql`COUNT(*)::int AS total, (COUNT(*) FILTER (WHERE s.late))::int AS late`,
      edges,
    );
  }

  async assignmentPerformance(scope: Scope, r: DateRange, n: number) {
    return this.prisma.$queryRaw<{ assignmentId: string; title: string; courseId: string; submissions: number; late: number; graded: number; scoreSum: number }[]>(Prisma.sql`
      SELECT s."assignmentId", a.title, a."courseId", COUNT(*)::int AS submissions, (COUNT(*) FILTER (WHERE s.late))::int AS late,
        (COUNT(*) FILTER (WHERE s.pct IS NOT NULL))::int AS graded, COALESCE(SUM(s.pct), 0)::float8 AS "scoreSum"
      FROM (${this.submissions(scope)}) s JOIN "Assignment" a ON a.id = s."assignmentId"
      WHERE s.at >= ${ts(r.from)} AND s.at <= ${ts(r.to)} GROUP BY s."assignmentId", a.title, a."courseId"
      ORDER BY submissions DESC, a.title ASC LIMIT ${n}::int`);
  }

  /** Held sessions (not cancelled, ended by `now`) by start time, with their attendance rows. */
  liveBuckets(scope: Scope, edges: Date[], now: Date) {
    return this.bucketed<{ sessions: number; seats: number; attended: number }>(
      Prisma.sql`SELECT c."startTime" AS at,
          (SELECT COUNT(*) FROM "Attendance" t WHERE t."liveClassId" = c.id)::int AS seats,
          (SELECT COUNT(*) FROM "Attendance" t WHERE t."liveClassId" = c.id AND t.status IN (${inList(ATTENDED_STATUSES)}))::int AS attended
        FROM "LiveClass" c WHERE ${tenant(Prisma.sql`c."institutionId"`, scope)} AND c.status <> ${CANCELLED_LIVE_STATUS} AND c."endTime" <= ${ts(now)}`,
      Prisma.sql`COUNT(*)::int AS sessions, COALESCE(SUM(s.seats), 0)::int AS seats, COALESCE(SUM(s.attended), 0)::int AS attended`,
      edges,
    );
  }

  certificateBuckets(scope: Scope, edges: Date[]) {
    return this.bucketed<{ n: number }>(
      Prisma.sql`SELECT c."issuedAt" AS at FROM "Certificate" c WHERE ${tenant(Prisma.sql`c."institutionId"`, scope)}`,
      Prisma.sql`COUNT(*)::int AS n`,
      edges,
    );
  }

  // ---------------------------------------------------------------- community

  communityBuckets(scope: Scope, edges: Date[]) {
    const d = tenant(Prisma.sql`d."institutionId"`, scope);
    return this.bucketed<{ threads: number; replies: number; reports: number }>(
      Prisma.sql`SELECT d."createdAt" AS at, 'thread' AS kind FROM "Discussion" d WHERE ${d}
        UNION ALL SELECT r."createdAt", 'reply' FROM "DiscussionReply" r JOIN "Discussion" d ON d.id = r."discussionId" WHERE ${d}
        UNION ALL SELECT x."createdAt", 'report' FROM "DiscussionReport" x WHERE ${tenant(Prisma.sql`x."institutionId"`, scope)}`,
      Prisma.sql`(COUNT(*) FILTER (WHERE s.kind = 'thread'))::int AS threads, (COUNT(*) FILTER (WHERE s.kind = 'reply'))::int AS replies,
        (COUNT(*) FILTER (WHERE s.kind = 'report'))::int AS reports`,
      edges,
    );
  }

  openReports(scope: Scope) {
    return this.prisma.discussionReport.count({ where: { institutionId: scope, status: "OPEN" } });
  }
}
