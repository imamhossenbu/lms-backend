import { instantToLocal, startOfLocalDay } from "../common/workspace-time";
import type { QuizAttempt, QuizItem } from "./quizzes.types";

/** Numbers for the quiz details page — same formulas as the panel's src/lib/quizStats.ts. Pure. */

const DAY_MS = 86_400_000;
const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 1000) / 10 : 0);
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const plain = (html: string) => html.replace(/<[^>]*>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").trim();

/** "Quizzes" list stat cards from status counts + creation dates. */
export function quizListStats(rows: { status: string; createdAt: Date }[], now = new Date()) {
  const total = rows.length;
  const count = (s: string) => rows.filter((r) => r.status === s).length;
  const published = count("PUBLISHED");
  const drafts = count("DRAFT");
  const archived = count("ARCHIVED");
  const since = now.getTime() - 30 * DAY_MS;
  const newThisMonth = rows.filter((r) => r.createdAt.getTime() >= since).length;
  const newLastMonth = rows.filter((r) => r.createdAt.getTime() >= since - 30 * DAY_MS && r.createdAt.getTime() < since).length;
  return {
    total,
    published,
    drafts,
    archived,
    publishedPct: Math.round(pct(published, total)),
    draftsPct: Math.round(pct(drafts, total)),
    archivedPct: Math.round(pct(archived, total)),
    newThisMonth,
    growthPct: total - newThisMonth > 0 ? Math.round((newThisMonth / (total - newThisMonth)) * 100) : 0,
    newLastMonth,
  };
}

export function attemptMetrics(attempts: QuizAttempt[]) {
  const total = attempts.length;
  const completed = attempts.filter((a) => a.completed);
  const passed = attempts.filter((a) => a.passed).length;
  return {
    total,
    passed,
    failed: total - passed,
    passRate: Math.round(pct(passed, total)),
    failRate: Math.round(pct(total - passed, total)),
    avgScore: Math.round(avg(completed.map((a) => a.score)) * 10) / 10,
    totalMarks: attempts[0]?.totalMarks ?? 0,
    avgTimeSeconds: Math.round(avg(completed.map((a) => a.timeTakenSeconds))),
    completed: completed.length,
    completionRate: Math.round(pct(completed.length, total)),
  };
}

/** % change of a metric: last `days` vs the `days` before (null without a baseline). */
export function trendVsPrevious(attempts: QuizAttempt[], metric: (a: QuizAttempt[]) => number, days = 30, now = new Date()) {
  const end = now.getTime();
  const t = (a: QuizAttempt) => Date.parse(a.submittedAt);
  const c = metric(attempts.filter((a) => t(a) > end - days * DAY_MS));
  const p = metric(attempts.filter((a) => t(a) <= end - days * DAY_MS && t(a) > end - 2 * days * DAY_MS));
  return p ? Math.round(((c - p) / p) * 100) : null;
}

export function scoreDistribution(attempts: QuizAttempt[], totalMarks: number) {
  const done = attempts.filter((a) => a.completed);
  const step = Math.max(1, Math.ceil(totalMarks / 5));
  const bands: { label: string; from: number; to: number }[] = [];
  for (let from = 0; from < totalMarks; from += step) {
    const to = Math.min(totalMarks - 1, from + step - 1);
    bands.push({ label: `${from}-${to}`, from, to });
  }
  bands.push({ label: String(totalMarks), from: totalMarks, to: totalMarks });
  return bands.map((b) => ({ label: b.label, count: done.filter((a) => a.score >= b.from && a.score <= b.to).length }));
}

export function percentBands(attempts: QuizAttempt[]) {
  const done = attempts.filter((a) => a.completed && a.totalMarks > 0);
  return [
    { key: "excellent", label: "90–100", min: 90, max: 100 },
    { key: "good", label: "70–89", min: 70, max: 89.99 },
    { key: "fair", label: "50–69", min: 50, max: 69.99 },
    { key: "low", label: "0–49", min: 0, max: 49.99 },
  ].map((b) => {
    const count = done.filter((a) => {
      const p = (a.score / a.totalMarks) * 100;
      return p >= b.min && p <= b.max;
    }).length;
    return { ...b, count, pct: Math.round(pct(count, done.length)) };
  });
}

/** Attempts + average score per workspace-local day (oldest first). */
export function dailyPerformance(attempts: QuizAttempt[], days = 30, now = new Date()) {
  const today = startOfLocalDay(now).getTime();
  return Array.from({ length: days }, (_, i) => {
    const start = today - (days - 1 - i) * DAY_MS;
    const inDay = attempts.filter((a) => {
      const t = Date.parse(a.submittedAt);
      return t >= start && t < start + DAY_MS;
    });
    const done = inDay.filter((a) => a.completed);
    return {
      date: new Date(start).toISOString(),
      day: instantToLocal(new Date(start)).date,
      attempts: inDay.length,
      avgScore: done.length ? Math.round(avg(done.map((a) => a.score)) * 10) / 10 : null,
    };
  });
}

export function questionPerformance(quiz: QuizItem, attempts: QuizAttempt[]) {
  return quiz.questions.map((q, i) => {
    const answers = attempts.flatMap((a) => a.answers.filter((x) => x.questionId === q.id));
    const correct = answers.filter((x) => x.correct).length;
    const correctPct = Math.round(pct(correct, answers.length));
    return {
      index: i + 1,
      questionId: q.id,
      text: plain(q.questionHtml),
      answered: answers.length,
      correctPct,
      incorrectPct: answers.length ? 100 - correctPct : 0,
      avgTimeSeconds: Math.round(avg(answers.map((x) => x.timeSeconds))),
    };
  });
}

export function timeDistribution(attempts: QuizAttempt[]) {
  const mins = attempts.filter((a) => a.completed).map((a) => a.timeTakenSeconds / 60);
  return [
    { label: "< 5 min", test: (m: number) => m < 5 },
    { label: "5–10 min", test: (m: number) => m >= 5 && m < 10 },
    { label: "10–20 min", test: (m: number) => m >= 10 && m < 20 },
    { label: "20–30 min", test: (m: number) => m >= 20 && m < 30 },
    { label: "> 30 min", test: (m: number) => m >= 30 },
  ].map((b) => ({ label: b.label, count: mins.filter(b.test).length }));
}

export const topStudents = (attempts: QuizAttempt[], n = 5) =>
  attempts
    .filter((a) => a.completed)
    .sort((a, b) => b.score - a.score || a.timeTakenSeconds - b.timeTakenSeconds)
    .slice(0, n);

/** Insight sentences for the Analytics / Submissions tabs. */
export function insightSentences(quiz: QuizItem, attempts: QuizAttempt[], now = new Date()) {
  const m = attemptMetrics(attempts);
  if (!m.total) return ["No attempts yet — insights appear once students start taking this quiz."];
  const out = [`${m.passRate}% of students passed this quiz.`];
  const top = [...timeDistribution(attempts)].sort((a, b) => b.count - a.count)[0];
  if (top?.count) out.push(`Most students take ${top.label.replace("< ", "under ").replace("> ", "over ")} to complete.`);
  const hardest = questionPerformance(quiz, attempts)
    .filter((q) => q.answered > 0)
    .sort((a, b) => a.correctPct - b.correctPct)[0];
  if (hardest) out.push(`Question ${hardest.index} has the lowest correct rate (${hardest.correctPct}%). Consider adding more explanation for this topic.`);
  const change = trendVsPrevious(attempts, (xs) => attemptMetrics(xs).avgScore, 30, now);
  if (change !== null) out.push(`Average score ${change >= 0 ? "increased" : "decreased"} by ${Math.abs(change)}% compared to the previous 30 days.`);
  if (quiz.timeLimitMinutes) {
    const within = attempts.filter((a) => a.completed && a.timeTakenSeconds <= quiz.timeLimitMinutes! * 60).length;
    out.push(`${Math.round(pct(within, m.completed))}% of completed attempts finished within the time limit.`);
  }
  return out;
}

export function quizInsights(quiz: QuizItem, attempts: QuizAttempt[], now = new Date()) {
  const totalMarks = quiz.questions.reduce((s, q) => s + q.points, 0);
  return {
    metrics: attemptMetrics(attempts),
    trends: {
      attempts: trendVsPrevious(attempts, (xs) => xs.length, 30, now),
      passRate: trendVsPrevious(attempts, (xs) => attemptMetrics(xs).passRate, 30, now),
      avgScore: trendVsPrevious(attempts, (xs) => attemptMetrics(xs).avgScore, 30, now),
      avgTimeSeconds: trendVsPrevious(attempts, (xs) => attemptMetrics(xs).avgTimeSeconds, 30, now),
    },
    scoreDistribution: scoreDistribution(attempts, totalMarks),
    percentBands: percentBands(attempts),
    daily: dailyPerformance(attempts, 30, now),
    questionPerformance: questionPerformance(quiz, attempts),
    timeDistribution: timeDistribution(attempts),
    topStudents: topStudents(attempts),
    insights: insightSentences(quiz, attempts, now),
  };
}
