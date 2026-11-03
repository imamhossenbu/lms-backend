import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { AnalyticsRangeDto, CoursesReportQueryDto, RevenueReportQueryDto, StudentsReportQueryDto } from "./dto/analytics-query.dto";
import {
  biggestChange,
  changePct,
  completionBreakdown,
  flow,
  makeKpi,
  mean,
  rankCourses,
  rankInstructors,
  ratio,
  retentionPoints,
  series,
  stock,
  stockMean,
  toBreakdown,
  withChange,
} from "./analytics-metrics";
import {
  autoGranularity,
  bucketEdges,
  buildBuckets,
  granularityOptions,
  isDateKey,
  kpiEdges,
  previousRange,
  resolveGranularity,
  resolveRange,
  splitRange,
} from "./analytics-range";
import type { CourseRow, Kpi } from "./analytics.types";

const messages = (cls: any, body: object) =>
  validateSync(plainToInstance(cls, body), { whitelist: true }).flatMap((e) => Object.values(e.constraints ?? {}));

const DHAKA = 360;
// 2026-11-03 15:00 in Dhaka.
const NOW = new Date("2026-11-03T09:00:00Z");

describe("analytics range (workspace time)", () => {
  it("validates calendar date keys", () => {
    expect(isDateKey("2026-02-28")).toBe(true);
    expect(isDateKey("2026-02-30")).toBe(false);
    expect(isDateKey("2026-2-1")).toBe(false);
    expect(isDateKey(undefined)).toBe(false);
  });

  it("resolves picker keys to workspace-local day bounds", () => {
    const r = resolveRange({ from: "2026-10-01", to: "2026-10-31" }, { now: NOW, offsetMinutes: DHAKA });
    expect(r.from.toISOString()).toBe("2026-09-30T18:00:00.000Z");
    expect(r.to.toISOString()).toBe("2026-10-31T17:59:59.999Z");
    expect(r).toMatchObject({ fromKey: "2026-10-01", toKey: "2026-10-31", isAllTime: false, days: 31 });
  });

  it("All time runs from the first data day to the end of today; reversed keys are swapped", () => {
    const all = resolveRange({}, { now: NOW, earliest: new Date("2026-06-10T20:30:00Z"), offsetMinutes: DHAKA });
    expect(all.isAllTime).toBe(true);
    // 20:30Z on Jun 10 is 02:30 on Jun 11 in Dhaka.
    expect(all.from.toISOString()).toBe("2026-06-10T18:00:00.000Z");
    expect(all.to.toISOString()).toBe("2026-11-03T17:59:59.999Z");
    const swapped = resolveRange({ from: "2026-10-10", to: "2026-10-01" }, { now: NOW, offsetMinutes: DHAKA });
    expect(swapped.days).toBe(10);
    expect(swapped.from < swapped.to).toBe(true);
    const noData = resolveRange({}, { now: NOW, earliest: null, offsetMinutes: DHAKA });
    expect(noData.days).toBe(30);
  });

  it("previous window has the same length and ends 1 ms before", () => {
    const r = resolveRange({ from: "2026-10-01", to: "2026-10-31" }, { now: NOW, offsetMinutes: DHAKA });
    const p = previousRange(r);
    expect(p.to.getTime()).toBe(r.from.getTime() - 1);
    expect(p.to.getTime() - p.from.getTime()).toBe(r.to.getTime() - r.from.getTime());
  });

  it("picks granularity and its options like the panel", () => {
    const d = (from: string, to: string) => resolveRange({ from, to }, { now: NOW, offsetMinutes: DHAKA });
    expect(autoGranularity(d("2026-10-01", "2026-10-31"), DHAKA)).toBe("day");
    expect(autoGranularity(d("2026-06-01", "2026-10-31"), DHAKA)).toBe("week");
    expect(autoGranularity(d("2025-01-01", "2026-10-31"), DHAKA)).toBe("month");
    expect(granularityOptions(d("2026-10-01", "2026-10-31"), DHAKA)).toEqual(["day", "week"]);
    expect(resolveGranularity(d("2025-01-01", "2026-10-31"), "day", DHAKA)).toBe("month");
    expect(resolveGranularity(d("2026-08-01", "2026-10-31"), "day", DHAKA)).toBe("day");
  });

  it("builds day / week / month buckets at workspace midnight with labels", () => {
    const r = resolveRange({ from: "2026-10-30", to: "2026-11-02" }, { now: NOW, offsetMinutes: DHAKA });
    const days = buildBuckets(r, "day", DHAKA);
    expect(days.map((b) => b.key)).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
    expect(days[0]).toMatchObject({ label: "Oct 30", fullLabel: "Oct 30, 2026" });
    expect(days[0].start.toISOString()).toBe("2026-10-29T18:00:00.000Z");
    expect(days[3].end.getTime()).toBe(r.to.getTime() + 1);

    const weeks = buildBuckets(resolveRange({ from: "2026-10-01", to: "2026-10-20" }, { now: NOW, offsetMinutes: DHAKA }), "week", DHAKA);
    expect(weeks.map((b) => b.fullLabel)).toEqual(["Oct 01 – Oct 07, 2026", "Oct 08 – Oct 14, 2026", "Oct 15 – Oct 20, 2026"]);

    const months = buildBuckets(resolveRange({ from: "2026-09-15", to: "2026-11-02" }, { now: NOW, offsetMinutes: DHAKA }), "month", DHAKA);
    expect(months.map((b) => b.label)).toEqual(["Sep 2026", "Oct 2026", "Nov 2026"]);
    expect(months[1].start.toISOString()).toBe("2026-09-30T18:00:00.000Z");
  });

  it("kpi edges: previous window + 10 segments; chart edges with an optional lead window", () => {
    const r = resolveRange({ from: "2026-10-01", to: "2026-10-10" }, { now: NOW, offsetMinutes: DHAKA });
    const edges = kpiEdges(r);
    expect(edges).toHaveLength(12);
    expect(edges[0].getTime()).toBe(previousRange(r).from.getTime());
    expect(edges[1].getTime()).toBe(r.from.getTime());
    expect(edges[11].getTime()).toBe(r.to.getTime() + 1);
    expect(splitRange(r, 10)[9].to.getTime()).toBe(r.to.getTime());
    const buckets = buildBuckets(r, "day", DHAKA);
    expect(bucketEdges(buckets)).toHaveLength(11);
    const lead = bucketEdges(buckets, true);
    expect(lead[1].getTime() - lead[0].getTime()).toBe(86_400_000);
  });
});

describe("analytics metrics (pure)", () => {
  // KPI buckets: 1 = previous, 2…11 = segments, 0 = before.
  const rows = new Map<number, { n: number; num: number; den: number }>([
    [0, { n: 5, num: 0, den: 0 }],
    [1, { n: 4, num: 1, den: 4 }],
    [2, { n: 2, num: 1, den: 2 }],
    [11, { n: 4, num: 3, den: 4 }],
  ]);

  it("flow KPI: value, previous, change and spark", () => {
    const k = makeKpi(false, flow(rows, (r) => r.n));
    expect(k).toEqual({ value: 6, previous: 4, changePct: 50, spark: [2, 0, 0, 0, 0, 0, 0, 0, 0, 4] });
  });

  it("All time has no comparison", () => {
    expect(makeKpi(true, flow(rows, (r) => r.n))).toMatchObject({ previous: 0, changePct: null });
    expect(changePct(5, 0, false)).toBeNull();
    expect(changePct(5, 10, false)).toBe(-50);
  });

  it("ratio and mean are ratios of sums, not averages of ratios", () => {
    expect(makeKpi(false, ratio(rows, (r) => r.num, (r) => r.den)).value).toBe(66.7);
    expect(makeKpi(false, mean(rows, (r) => r.num, (r) => r.den)).value).toBe(0.67);
    expect(makeKpi(false, ratio(new Map(), () => 1, () => 1)).value).toBe(0);
  });

  it("stock KPIs are cumulative levels at each window end", () => {
    const k = makeKpi(false, stock(rows, (r) => r.n));
    expect(k.value).toBe(15);
    expect(k.previous).toBe(9);
    expect(k.spark).toEqual([11, 11, 11, 11, 11, 11, 11, 11, 11, 15]);
    const m = makeKpi(false, stockMean(rows, (r) => r.num, (r) => r.den));
    expect(m.value).toBe(0.5);
  });

  it("series maps chart bucket i to SQL index i + 1", () => {
    const r = resolveRange({ from: "2026-10-01", to: "2026-10-02" }, { now: NOW, offsetMinutes: DHAKA });
    const pts = series(buildBuckets(r, "day", DHAKA), new Map([[2, { n: 7 }]]), (x) => ({ value: x?.n ?? 0 }));
    expect(pts.map((p) => p.value)).toEqual([0, 7]);
    expect(pts[1]).toMatchObject({ key: "2026-10-02", start: "2026-10-01T18:00:00.000Z" });
  });

  it("breakdown shares and change vs previous", () => {
    const b = toBreakdown([
      { key: "a", label: "A", value: 100, count: 2 },
      { key: "b", label: "B", value: 300.456, count: 1 },
    ]);
    expect(b.map((x) => [x.key, x.value, x.share])).toEqual([
      ["b", 300.46, 75],
      ["a", 100, 25],
    ]);
    const c = withChange(b, [{ key: "a", label: "A", value: 50, count: 1, share: 100 }], false);
    expect(c.find((x) => x.key === "a")?.changePct).toBe(100);
    expect(c.find((x) => x.key === "b")?.changePct).toBeNull();
  });

  it("retention: returning learners vs the bucket before (index 1 = lead window)", () => {
    const r = resolveRange({ from: "2026-10-01", to: "2026-10-02" }, { now: NOW, offsetMinutes: DHAKA });
    const pts = retentionPoints(
      buildBuckets(r, "day", DHAKA),
      new Map([
        [1, { active: 4, returning: 0 }],
        [2, { active: 3, returning: 2 }],
        [3, { active: 2, returning: 1 }],
      ]),
    );
    expect(pts.map((p) => [p.active, p.returning, p.newActive, p.retentionRate])).toEqual([
      [3, 2, 1, 50],
      [2, 1, 1, 33.3],
    ]);
  });

  it("completion breakdown", () => {
    expect(completionBreakdown(1, 2, 1)).toMatchObject({ completionRate: 25, enrolled: 4 });
    expect(completionBreakdown(0, 0, 0).segments.map((s) => s.pct)).toEqual([0, 0, 0]);
  });

  it("biggest change ignores KPIs without a comparison", () => {
    const k = (changePct: number | null): Kpi => ({ value: 1, previous: 1, changePct, spark: [] });
    const out = biggestChange({
      netRevenue: k(10),
      orders: k(-40),
      conversion: k(null),
      newEnrollments: k(5),
      activeLearners: k(null),
      avgCompletion: k(0),
      certificates: k(null),
      quizPassRate: k(null),
    });
    expect(out).toMatchObject({ key: "orders", label: "Orders" });
  });

  it("ranks courses and instructors", () => {
    const course = (id: string, instructorId: string, enrollments: number, revenue: number, rating: number | null): CourseRow & { instructorId: string; instructorAvatar: string | null } => ({
      courseId: id,
      title: id,
      instructor: instructorId.toUpperCase(),
      category: "Dev",
      thumbnailUrl: "",
      price: 10,
      enrollments,
      revenue,
      completionPct: null,
      rating,
      instructorId,
      instructorAvatar: null,
    });
    const rows = [course("c1", "i1", 5, 100, 4), course("c2", "i1", 1, 900, 5), course("c3", "i2", 9, 50, null), course("c4", "i2", 0, 0, 3)];
    expect(rankCourses(rows, "enrollments", 10).map((c) => c.courseId)).toEqual(["c3", "c1", "c2"]);
    expect(rankCourses(rows, "revenue", 1).map((c) => c.courseId)).toEqual(["c2"]);
    const leaders = rankInstructors(rows, "revenue", 5);
    expect(leaders).toEqual([
      { id: "i1", name: "I1", courses: 2, enrollments: 6, revenue: 1000, rating: 4.5 },
      { id: "i2", name: "I2", courses: 1, enrollments: 9, revenue: 50, rating: null },
    ]);
    expect(rankInstructors(rows, "enrollments", 5)[0].id).toBe("i2");
  });
});

describe("analytics query DTOs", () => {
  it("accepts picker keys and options", () => {
    expect(messages(AnalyticsRangeDto, {})).toEqual([]);
    expect(messages(AnalyticsRangeDto, { from: "2026-10-01", to: "2026-10-31" })).toEqual([]);
    expect(messages(RevenueReportQueryDto, { granularity: "week" })).toEqual([]);
    expect(messages(StudentsReportQueryDto, { studentRank: "spent" })).toEqual([]);
    expect(messages(CoursesReportQueryDto, { instructorRank: "enrollments" })).toEqual([]);
  });

  it("rejects bad dates and options with friendly messages", () => {
    expect(messages(AnalyticsRangeDto, { from: "2026-13-01" })).toEqual(["from must be a valid date (YYYY-MM-DD)"]);
    expect(messages(AnalyticsRangeDto, { to: "yesterday" })).toEqual(["to must be a valid date (YYYY-MM-DD)"]);
    expect(messages(RevenueReportQueryDto, { granularity: "year" })).toEqual(["granularity must be day, week or month"]);
    expect(messages(StudentsReportQueryDto, { studentRank: "name" })).toEqual(["studentRank must be completion, score or spent"]);
    expect(messages(CoursesReportQueryDto, { instructorRank: "rating" })).toEqual(["instructorRank must be revenue or enrollments"]);
  });
});
