import type { LiveClass } from "../../generated/prisma";
import { instantToLocal } from "../common/workspace-time";
import { displayStatus } from "./live-class.mapper";
import type { LiveEnrollment, LiveQuestion } from "./live-classes.types";

/** Numbers for the Live Classes pages — same formulas as the panel's src/lib/liveClassStats.ts. Pure. */

const DAY_MS = 86_400_000;
const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 100) : 0);

export function attendanceStats(rows: LiveEnrollment[]) {
  const attended = rows.filter((r) => r.status === "ATTENDED");
  const absent = rows.filter((r) => r.status === "ABSENT").length;
  const notJoined = rows.filter((r) => r.status === "NOT_JOINED").length;
  return {
    enrolled: rows.length,
    attended: attended.length,
    absent,
    notJoined,
    attendedPct: pct(attended.length, rows.length),
    absentPct: pct(absent, rows.length),
    notJoinedPct: pct(notJoined, rows.length),
    avgWatchMinutes: attended.length ? Math.round(attended.reduce((s, r) => s + r.watchMinutes, 0) / attended.length) : 0,
  };
}

/** People present over time, sampled every `step` minutes from start to end ("HH:mm" labels). */
export function attendanceTimeline(rows: LiveEnrollment[], c: Pick<LiveClass, "startTime" | "endTime">, step = 5) {
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  const start = toMin(instantToLocal(c.startTime).time);
  const end = toMin(instantToLocal(c.endTime).time);
  const points: { time: string; present: number }[] = [];
  for (let t = start; t <= end; t += step) {
    const present = rows.filter((r) => r.status === "ATTENDED" && r.joinTime && toMin(r.joinTime) <= t && (!r.leaveTime || toMin(r.leaveTime) > t)).length;
    points.push({ time: `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`, present });
  }
  return points;
}

export const topEngaged = (rows: LiveEnrollment[], n = 5) =>
  rows
    .filter((r) => r.status === "ATTENDED")
    .sort((a, b) => b.watchMinutes - a.watchMinutes || a.joinTime.localeCompare(b.joinTime))
    .slice(0, n);

export function qaStats(questions: Pick<LiveQuestion, "status">[]) {
  const answered = questions.filter((q) => q.status === "ANSWERED").length;
  return { asked: questions.length, answered, pending: questions.length - answered, answeredPct: pct(answered, questions.length) };
}

/** List cards: all-time totals + % change of the last 30 days vs the 30 days before (null without a baseline). */
export function liveListStats(classes: Pick<LiveClass, "id" | "status" | "startTime" | "endTime">[], attendedBy: Map<string, number>, now = new Date()) {
  const statusOf = new Map(classes.map((c) => [c.id, displayStatus(c, now)]));
  const t = now.getTime();
  const window = (from: number, to: number) => {
    const cs = classes.filter((c) => c.startTime.getTime() >= from && c.startTime.getTime() < to);
    return {
      total: cs.length,
      attendees: cs.reduce((s, c) => s + (attendedBy.get(c.id) ?? 0), 0),
      completed: cs.filter((c) => statusOf.get(c.id) === "COMPLETED").length,
      cancelled: cs.filter((c) => statusOf.get(c.id) === "CANCELLED").length,
    };
  };
  const cur = window(t - 30 * DAY_MS, t);
  const prev = window(t - 60 * DAY_MS, t - 30 * DAY_MS);
  const change = (a: number, b: number) => (b ? Math.round(((a - b) / b) * 100) : null);
  const count = (s: string) => classes.filter((c) => statusOf.get(c.id) === s).length;
  return {
    total: classes.length,
    attendees: [...attendedBy.values()].reduce((a, b) => a + b, 0),
    completed: count("COMPLETED"),
    upcoming: count("UPCOMING") + count("SCHEDULED") + count("LIVE"),
    cancelled: count("CANCELLED"),
    change: {
      total: change(cur.total, prev.total),
      attendees: change(cur.attendees, prev.attendees),
      completed: change(cur.completed, prev.completed),
      cancelled: change(cur.cancelled, prev.cancelled),
    },
  };
}
