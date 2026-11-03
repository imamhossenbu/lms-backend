/**
 * Analytics: pure assembly of SQL bucket rows into the panel's shapes (no Prisma, no clock).
 *
 * The data layer runs `width_bucket(at, edges)` aggregates (see analytics-range.ts kpiEdges / bucketEdges)
 * and hands back `Buckets<T>` = Map<bucket index, aggregate row>. KPI buckets: 0 = before the previous window,
 * 1 = previous window, 2…11 = the 10 spark segments of the range. Chart buckets: chart point i ↔ index i + 1.
 *
 *   makeKpi(isAllTime, measure)   measure(indices) → number over those buckets
 *   flow / ratio / stock          ready-made measures (sum, Σnum / Σden %, cumulative level)
 *   toBreakdown(rows)             BreakdownRow[] with share %, sorted by value desc
 *   withChange(current, previous) RevenueCourseRow[]
 *   retentionPoints / completionBreakdown / biggestChange / rankCourses / rankInstructors
 */

import { SPARK_POINTS } from "./analytics-range";
import type {
  BreakdownRow,
  BucketPoint,
  CompletionBreakdown,
  CourseRow,
  InstructorRankBy,
  InstructorRow,
  Kpi,
  OverviewKpiKey,
  RetentionPoint,
  RevenueCourseRow,
  TimeBucket,
} from "./analytics.types";

export const round1 = (n: number) => Math.round(n * 10) / 10;
export const round2 = (n: number) => Math.round(n * 100) / 100;
/** part / total × 100 (1 dp), 0 when total is 0. */
export const pctOf = (part: number, total: number) => (total > 0 ? round1((part / total) * 100) : 0);

export type Buckets<T> = Map<number, T>;

export const PREVIOUS_BUCKET = 1;
/** Bucket indices of the 10 spark segments (2…11). */
export const SEGMENT_BUCKETS = Array.from({ length: SPARK_POINTS }, (_, i) => i + 2);

export const changePct = (value: number, previous: number, isAllTime: boolean): number | null =>
  isAllTime || previous === 0 ? null : round1(((value - previous) / Math.abs(previous)) * 100);

/** Kpi from a measure over KPI bucket indices. */
export function makeKpi(isAllTime: boolean, measure: (indices: number[]) => number): Kpi {
  const value = measure(SEGMENT_BUCKETS);
  const previous = isAllTime ? 0 : measure([PREVIOUS_BUCKET]);
  return { value, previous, changePct: changePct(value, previous, isAllTime), spark: SEGMENT_BUCKETS.map((i) => measure([i])) };
}

const field = <T>(rows: Buckets<T>, i: number, f: (r: T) => number) => {
  const r = rows.get(i);
  return r ? Number(f(r)) || 0 : 0;
};

/** Σ field over the buckets (flow metric: revenue, counts). */
export const flow =
  <T>(rows: Buckets<T>, f: (r: T) => number, round = false) =>
  (indices: number[]) => {
    const s = indices.reduce((acc, i) => acc + field(rows, i, f), 0);
    return round ? round2(s) : s;
  };

/** Σ num / Σ den × 100 over the buckets (rate metric). */
export const ratio =
  <T>(rows: Buckets<T>, num: (r: T) => number, den: (r: T) => number) =>
  (indices: number[]) =>
    pctOf(
      indices.reduce((a, i) => a + field(rows, i, num), 0),
      indices.reduce((a, i) => a + field(rows, i, den), 0),
    );

/** Σ num / Σ den (2 dp) over the buckets, 0 when den is 0 (e.g. average order value). */
export const mean =
  <T>(rows: Buckets<T>, num: (r: T) => number, den: (r: T) => number, digits: 1 | 2 = 2) =>
  (indices: number[]) => {
    const n = indices.reduce((a, i) => a + field(rows, i, num), 0);
    const d = indices.reduce((a, i) => a + field(rows, i, den), 0);
    return d ? (digits === 1 ? round1(n / d) : round2(n / d)) : 0;
  };

/**
 * Stock metric: level at the end of the latest bucket asked for (Σ buckets 0…max).
 * Rows must be queried cumulatively (no lower bound) so bucket 0 holds everything before the previous window.
 */
export const stock =
  <T>(rows: Buckets<T>, f: (r: T) => number) =>
  (indices: number[]) => {
    const last = Math.max(...indices);
    let s = 0;
    for (let i = 0; i <= last; i++) s += field(rows, i, f);
    return s;
  };

/** Cumulative Σ num / Σ den (1 dp), e.g. mean completion of students joined by each window's end. */
export const stockMean =
  <T>(rows: Buckets<T>, num: (r: T) => number, den: (r: T) => number) =>
  (indices: number[]) => {
    const last = Math.max(...indices);
    let n = 0;
    let d = 0;
    for (let i = 0; i <= last; i++) {
      n += field(rows, i, num);
      d += field(rows, i, den);
    }
    return d ? round1(n / d) : 0;
  };

/** TimeBucket → API point (ISO dates). */
export const point = (b: TimeBucket): BucketPoint => ({ key: b.key, label: b.label, fullLabel: b.fullLabel, start: b.start.toISOString(), end: b.end.toISOString() });

/** One point per chart bucket; `fill(row | undefined)` builds the numbers (chart bucket i ↔ SQL index i + 1). */
export const series = <T, P>(buckets: TimeBucket[], rows: Buckets<T>, fill: (row: T | undefined) => P): (BucketPoint & P)[] =>
  buckets.map((b, i) => ({ ...point(b), ...fill(rows.get(i + 1)) }));

/** Label / value / count rows → BreakdownRow[] with share of Σ value, sorted by value then count. */
export function toBreakdown(rows: { key: string; label: string; value: number; count: number }[]): BreakdownRow[] {
  const total = rows.reduce((s, r) => s + r.value, 0);
  return rows
    .map((r) => ({ key: r.key, label: r.label, value: round2(r.value), count: r.count, share: pctOf(r.value, total) }))
    .sort((a, b) => b.value - a.value || b.count - a.count);
}

/** Adds each row's change vs the previous window (null for All time / no previous value). */
export function withChange(current: BreakdownRow[], previous: BreakdownRow[], isAllTime: boolean): RevenueCourseRow[] {
  const prev = new Map(previous.map((p) => [p.key, p.value]));
  return current.map((row) => ({ ...row, changePct: changePct(row.value, prev.get(row.key) ?? 0, isAllTime) }));
}

/**
 * Retention per chart bucket from distinct-learner rows: `active` per SQL index and `returning` (also active
 * in the index before). Index 1 is the lead window before the first bucket (see bucketEdges(…, true)).
 */
export function retentionPoints(buckets: TimeBucket[], rows: Buckets<{ active: number; returning: number }>): (BucketPoint & Omit<RetentionPoint, keyof BucketPoint>)[] {
  return buckets.map((b, i) => {
    const cur = rows.get(i + 2);
    const before = rows.get(i + 1)?.active ?? 0;
    const active = cur?.active ?? 0;
    const returning = cur?.returning ?? 0;
    return { ...point(b), active, returning, newActive: active - returning, retentionRate: pctOf(returning, before) };
  });
}

/** Completed seats vs open seats of Active students (in progress) and of everyone else (stalled). */
export function completionBreakdown(completed: number, inProgress: number, stalled: number): CompletionBreakdown {
  const enrolled = completed + inProgress + stalled;
  const share = (n: number) => (enrolled ? Math.round((n / enrolled) * 100) : 0);
  return {
    completionRate: share(completed),
    enrolled,
    segments: [
      { key: "completed", label: "Completed", count: completed, pct: share(completed) },
      { key: "inProgress", label: "In Progress", count: inProgress, pct: share(inProgress) },
      { key: "stalled", label: "Inactive", count: stalled, pct: share(stalled) },
    ],
  };
}

export const OVERVIEW_KPI_LABEL: Record<OverviewKpiKey, string> = {
  netRevenue: "Net revenue",
  orders: "Orders",
  conversion: "Conversion",
  newEnrollments: "New enrollments",
  activeLearners: "Active learners",
  avgCompletion: "Avg completion",
  certificates: "Certificates issued",
  quizPassRate: "Quiz pass rate",
};

/** KPI with the largest |change %| (null when none has a comparison). */
export function biggestChange(kpis: Record<OverviewKpiKey, Kpi>): { key: OverviewKpiKey; label: string; kpi: Kpi } | null {
  return (
    (Object.keys(kpis) as OverviewKpiKey[])
      .map((key) => ({ key, label: OVERVIEW_KPI_LABEL[key], kpi: kpis[key] }))
      .filter((k) => k.kpi.changePct !== null)
      .sort((a, b) => Math.abs(b.kpi.changePct!) - Math.abs(a.kpi.changePct!))[0] ?? null
  );
}

/** Courses with activity in the range, ranked (ties → revenue), top n. */
export function rankCourses(rows: CourseRow[], by: "enrollments" | "revenue", n: number): CourseRow[] {
  return rows
    .filter((c) => c.enrollments > 0 || c.revenue > 0)
    .sort((a, b) => (by === "revenue" ? b.revenue - a.revenue : b.enrollments - a.enrollments) || b.revenue - a.revenue || a.title.localeCompare(b.title))
    .slice(0, n);
}

/** Per-course rows → instructor leaderboard (rating = mean of their rated courses). */
export function rankInstructors(
  rows: (CourseRow & { instructorId: string; instructorAvatar: string | null })[],
  by: InstructorRankBy,
  n: number,
): InstructorRow[] {
  const map = new Map<string, InstructorRow & { ratings: number[] }>();
  rows
    .filter((c) => c.enrollments > 0 || c.revenue > 0)
    .forEach((c) => {
      const row = map.get(c.instructorId) ?? {
        id: c.instructorId,
        name: c.instructor,
        ...(c.instructorAvatar ? { avatarUrl: c.instructorAvatar } : {}),
        courses: 0,
        enrollments: 0,
        revenue: 0,
        rating: null,
        ratings: [],
      };
      row.courses++;
      row.enrollments += c.enrollments;
      row.revenue += c.revenue;
      if (c.rating !== null) row.ratings.push(c.rating);
      map.set(c.instructorId, row);
    });
  return Array.from(map.values())
    .map(({ ratings, ...row }) => ({ ...row, revenue: round2(row.revenue), rating: ratings.length ? round1(ratings.reduce((a, b) => a + b, 0) / ratings.length) : null }))
    .sort((a, b) => (by === "revenue" ? b.revenue - a.revenue : b.enrollments - a.enrollments) || b.revenue - a.revenue || a.name.localeCompare(b.name))
    .slice(0, n);
}
