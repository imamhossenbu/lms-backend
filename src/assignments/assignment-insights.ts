import { instantToLocal, startOfLocalDay } from "../common/workspace-time";
import type { AssignmentItem, AssignmentRubric, AssignmentSubmission, CourseAssignmentStats, SubmissionCounts } from "./assignments.types";

/**
 * Numbers for the assignment details page (Overview + Analytics tabs) — the same formulas as the panel's
 * src/lib/assignmentStats.ts, computed over ALL of an assignment's submissions. Pure.
 */

const DAY_MS = 86_400_000;
const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 1000) / 10 : 0);
const graded = (subs: AssignmentSubmission[]) => subs.filter((s) => s.status === "GRADED" && s.score !== null);

export function submissionCounts(subs: { status: string; isLate: boolean }[]): SubmissionCounts {
  const g = subs.filter((s) => s.status === "GRADED").length;
  return { total: subs.length, graded: g, pending: subs.length - g, late: subs.filter((s) => s.isLate).length };
}

export function submissionStats(subs: AssignmentSubmission[]) {
  const c = submissionCounts(subs);
  return { ...c, gradedPct: pct(c.graded, c.total), pendingPct: pct(c.pending, c.total), latePct: pct(c.late, c.total) };
}

export function courseStats(totalAssignments: number, counts: SubmissionCounts): CourseAssignmentStats {
  return { totalAssignments, totalSubmissions: counts.total, pendingReview: counts.pending, graded: counts.graded };
}

export function gradeDistribution(subs: AssignmentSubmission[], totalPoints: number) {
  const buckets = [
    { key: "A", label: "A (90-100)", min: 90 },
    { key: "B", label: "B (80-89)", min: 80 },
    { key: "C", label: "C (70-79)", min: 70 },
    { key: "D", label: "D (60-69)", min: 60 },
    { key: "F", label: "F (0-59)", min: 0 },
  ].map((b) => ({ ...b, count: 0 }));
  const g = graded(subs);
  for (const s of g) {
    const p = ((s.score as number) / totalPoints) * 100;
    (buckets.find((b) => p >= b.min) ?? buckets[buckets.length - 1]).count += 1;
  }
  return buckets.map((b) => ({ ...b, pct: pct(b.count, g.length) }));
}

export function scoreHistogram(subs: AssignmentSubmission[], totalPoints: number) {
  const edges = [0, 0.3, 0.45, 0.6, 0.75, 0.9].map((f) => Math.round(totalPoints * f));
  return edges.map((from, i) => {
    const to = i < edges.length - 1 ? edges[i + 1] - 1 : totalPoints;
    return { label: `${from}-${to}`, count: graded(subs).filter((s) => (s.score as number) >= from && (s.score as number) <= to).length };
  });
}

/** Submissions and average % score per workspace-local day for the last `days` days (oldest first). */
export function dailyActivity(subs: AssignmentSubmission[], totalPoints: number, days = 7, now = new Date()) {
  const today = startOfLocalDay(now).getTime();
  return Array.from({ length: days }, (_, i) => {
    const start = today - (days - 1 - i) * DAY_MS;
    const inDay = subs.filter((s) => {
      const t = Date.parse(s.submittedAt);
      return t >= start && t < start + DAY_MS;
    });
    const g = inDay.filter((s) => s.score !== null);
    const avg = g.length ? g.reduce((sum, s) => sum + (s.score as number), 0) / g.length : null;
    return {
      date: new Date(start).toISOString(),
      day: instantToLocal(new Date(start)).date,
      count: inDay.length,
      gradedCount: g.length,
      avgPct: avg === null ? null : Math.round((avg / totalPoints) * 100),
    };
  });
}

export function criteriaPerformance(subs: AssignmentSubmission[], rubric: AssignmentRubric) {
  const g = subs.filter((s) => s.status === "GRADED");
  return rubric.criteria.map((c) => {
    const scores = g.map((s) => s.criterionScores[c.id]).filter((v): v is number => typeof v === "number");
    const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    return { id: c.id, title: c.title, max: c.points, avg: Math.round(avg * 10) / 10, pct: c.points ? Math.round((avg / c.points) * 100) : 0 };
  });
}

export const topPerformers = (subs: AssignmentSubmission[], n = 3) =>
  graded(subs)
    .sort((a, b) => (b.score as number) - (a.score as number) || a.submittedAt.localeCompare(b.submittedAt))
    .slice(0, n);

/** Pending (oldest first), then graded-but-late. */
export const needsAttention = (subs: AssignmentSubmission[], n = 4) =>
  [
    ...subs.filter((s) => s.status === "PENDING").sort((a, b) => a.submittedAt.localeCompare(b.submittedAt)),
    ...subs.filter((s) => s.status === "GRADED" && s.isLate),
  ].slice(0, n);

export const recentActivity = (subs: AssignmentSubmission[], n = 4) => [...subs].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)).slice(0, n);

export function assignmentInsights(a: AssignmentItem, subs: AssignmentSubmission[], now = new Date()) {
  const scores = graded(subs).map((s) => s.score as number);
  return {
    stats: submissionStats(subs),
    notSubmitted: Math.max(0, a.enrolledCount - new Set(subs.map((s) => s.student.id)).size),
    averageScore: scores.length ? Math.round((scores.reduce((x, y) => x + y, 0) / scores.length) * 10) / 10 : null,
    gradeDistribution: gradeDistribution(subs, a.totalPoints),
    scoreHistogram: scoreHistogram(subs, a.totalPoints),
    daily: dailyActivity(subs, a.totalPoints, 7, now),
    criteriaPerformance: criteriaPerformance(subs, a.rubric),
    topPerformers: topPerformers(subs),
    needsAttention: needsAttention(subs),
    recentActivity: recentActivity(subs),
  };
}
