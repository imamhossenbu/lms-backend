/**
 * Analytics: reporting-window maths in WORKSPACE time (pure; the UTC offset is a parameter for tests).
 * Backend copy of lms-admin-panel src/lib/analytics/analyticsRange.ts — same rules, but days, weeks and
 * months start at workspace-local midnight (common/workspace-time.ts) instead of the browser's.
 *
 *   resolveRange(keys, { now, earliest })  → ResolvedRange  (no keys = All time: earliest data day → today)
 *   previousRange(range)                   → DateRange      (same length, ending 1 ms before range.from)
 *   autoGranularity(range)                 → "day" ≤ 31 days, "week" ≤ 182 days, else "month"
 *   granularityOptions(range)              → buckets that make sense (auto always allowed)
 *   buildBuckets(range, granularity)       → TimeBucket[]   (days / rolling 7-day weeks / calendar months, clipped)
 *   splitRange(range, n = 10)              → DateRange[]    (KPI sparkline segments)
 *   kpiEdges(range) / bucketEdges(buckets) → Date[]         (SQL width_bucket thresholds, see analytics-metrics.ts)
 */

import { localToInstant, instantToLocal, WORKSPACE_UTC_OFFSET_MINUTES } from "../common/workspace-time";
import type { DateRange, Granularity, ResolvedRange, TimeBucket } from "./analytics.types";

export const DAY_MS = 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const GRANULARITIES = ["day", "week", "month"] as const;
export const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Real calendar day in "YYYY-MM-DD" form. */
export function isDateKey(v: unknown): v is string {
  if (typeof v !== "string" || !DATE_KEY_RE.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Wall-clock fields of `at` in the workspace (read with getUTC*). */
const wall = (at: Date, off: number) => new Date(at.getTime() + off * 60_000);
const fromWall = (wallMs: number, off: number) => new Date(wallMs - off * 60_000);

export const startOfDay = (at: Date, off = WORKSPACE_UTC_OFFSET_MINUTES) => {
  const w = wall(at, off);
  return fromWall(Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate()), off);
};
export const endOfDay = (at: Date, off = WORKSPACE_UTC_OFFSET_MINUTES) => new Date(startOfDay(at, off).getTime() + DAY_MS - 1);

const startOfNextMonth = (at: Date, off: number) => {
  const w = wall(at, off);
  return fromWall(Date.UTC(w.getUTCFullYear(), w.getUTCMonth() + 1, 1), off);
};

const daysBetween = (from: Date, to: Date, off: number) =>
  Math.max(1, Math.round((startOfDay(to, off).getTime() - startOfDay(from, off).getTime()) / DAY_MS) + 1);

/**
 * Picker keys → absolute window. Missing `from` = first data day (`earliest`, else 30 days back), missing `to` = today.
 * Reversed keys are swapped.
 */
export function resolveRange(
  keys: { from?: string; to?: string },
  opts: { now: Date; earliest?: Date | null; offsetMinutes?: number },
): ResolvedRange {
  const off = opts.offsetMinutes ?? WORKSPACE_UTC_OFFSET_MINUTES;
  const fromKey = isDateKey(keys.from) ? keys.from : null;
  const toKey = isDateKey(keys.to) ? keys.to : null;
  const isAllTime = !fromKey && !toKey;
  let to = toKey ? new Date(localToInstant(toKey, "00:00", off)!.getTime() + DAY_MS - 1) : endOfDay(opts.now, off);
  let from = fromKey ? localToInstant(fromKey, "00:00", off)! : startOfDay(opts.earliest ?? new Date(opts.now.getTime() - 29 * DAY_MS), off);
  if (from > to) [from, to] = [startOfDay(to, off), endOfDay(from, off)];
  return { from, to, fromKey, toKey, isAllTime, days: daysBetween(from, to, off) };
}

export function previousRange(range: DateRange): DateRange {
  const length = range.to.getTime() - range.from.getTime();
  const to = new Date(range.from.getTime() - 1);
  return { from: new Date(to.getTime() - length), to };
}

export function autoGranularity(range: DateRange, off = WORKSPACE_UTC_OFFSET_MINUTES): Granularity {
  const days = daysBetween(range.from, range.to, off);
  if (days <= 31) return "day";
  if (days <= 182) return "week";
  return "month";
}

/** Day ≤ 92 days, week ≥ 14 days, month ≥ 60 days; the auto granularity is always allowed. */
export function granularityOptions(range: DateRange, off = WORKSPACE_UTC_OFFSET_MINUTES): Granularity[] {
  const days = Math.max(1, Math.round((range.to.getTime() - range.from.getTime()) / DAY_MS));
  const auto = autoGranularity(range, off);
  return GRANULARITIES.filter((g) => g === auto || (g === "day" && days <= 92) || (g === "week" && days >= 14) || (g === "month" && days >= 60));
}

/** Requested granularity when it suits the range, else the automatic one. */
export const resolveGranularity = (range: DateRange, requested?: string | null, off = WORKSPACE_UTC_OFFSET_MINUTES): Granularity =>
  granularityOptions(range, off).includes(requested as Granularity) ? (requested as Granularity) : autoGranularity(range, off);

const pad = (n: number) => String(n).padStart(2, "0");
const shortDay = (at: Date, off: number) => {
  const w = wall(at, off);
  return `${MONTHS[w.getUTCMonth()]} ${pad(w.getUTCDate())}`;
};
const longDay = (at: Date, off: number) => `${shortDay(at, off)}, ${wall(at, off).getUTCFullYear()}`;

/** X-axis buckets covering the range (last bucket clipped to range.to). */
export function buildBuckets(range: DateRange, granularity: Granularity = autoGranularity(range), off = WORKSPACE_UTC_OFFSET_MINUTES): TimeBucket[] {
  const buckets: TimeBucket[] = [];
  const endMs = range.to.getTime();
  let start = startOfDay(range.from, off);
  let guard = 0;
  while (start.getTime() <= endMs && guard++ < 1000) {
    const next =
      granularity === "day" ? new Date(start.getTime() + DAY_MS) : granularity === "week" ? new Date(start.getTime() + 7 * DAY_MS) : startOfNextMonth(start, off);
    const end = new Date(Math.min(next.getTime(), endMs + 1));
    const lastDay = new Date(end.getTime() - 1);
    const w = wall(start, off);
    const label = granularity === "month" ? `${MONTHS[w.getUTCMonth()]} ${w.getUTCFullYear()}` : shortDay(start, off);
    const fullLabel =
      granularity === "day" || startOfDay(lastDay, off).getTime() === start.getTime() ? longDay(start, off) : `${shortDay(start, off)} – ${longDay(lastDay, off)}`;
    buckets.push({ key: instantToLocal(start, off).date, label, fullLabel, start, end });
    start = next;
  }
  return buckets;
}

/** n equal consecutive segments (inclusive ends). */
export function splitRange(range: DateRange, n = 10): DateRange[] {
  const startMs = range.from.getTime();
  const span = range.to.getTime() - startMs + 1;
  return Array.from({ length: n }, (_, i) => ({
    from: new Date(startMs + Math.floor((span * i) / n)),
    to: new Date(startMs + Math.floor((span * (i + 1)) / n) - 1),
  }));
}

/** Number of sparkline segments per KPI. */
export const SPARK_POINTS = 10;

/**
 * KPI thresholds: [previous.from, segment starts…, range.to + 1 ms].
 * SQL width_bucket → 0 = before the previous window, 1 = previous window, 2…11 = the 10 spark segments.
 */
export const kpiEdges = (range: DateRange): Date[] => [
  previousRange(range).from,
  ...splitRange(range, SPARK_POINTS).map((s) => s.from),
  new Date(range.to.getTime() + 1),
];

/** Chart thresholds: bucket i ↔ width_bucket i + 1. With `withLead`, a window as long as the first bucket goes first (retention). */
export function bucketEdges(buckets: TimeBucket[], withLead = false): Date[] {
  if (buckets.length === 0) return [];
  const edges = [...buckets.map((b) => b.start), buckets[buckets.length - 1].end];
  if (withLead) edges.unshift(new Date(buckets[0].start.getTime() - (buckets[0].end.getTime() - buckets[0].start.getTime())));
  return edges;
}
