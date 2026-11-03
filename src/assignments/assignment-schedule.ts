import { WORKSPACE_UTC_OFFSET_MINUTES } from "./assignments.constants";

/** Workspace-local "YYYY-MM-DD" + "HH:mm" ⇄ UTC instants. Pure; the offset is a parameter for tests. */

const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-11-20" + "23:59" → the instant that wall time happens in the workspace. Returns null for "". */
export function localToInstant(date: string, time: string, offsetMinutes = WORKSPACE_UTC_OFFSET_MINUTES): Date | null {
  if (!date) return null;
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = (time || "00:00").split(":").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh, mm) - offsetMinutes * 60_000);
}

/** Instant → { date: "YYYY-MM-DD", time: "HH:mm" } in the workspace. null → empty strings. */
export function instantToLocal(at: Date | null, offsetMinutes = WORKSPACE_UTC_OFFSET_MINUTES): { date: string; time: string } {
  if (!at) return { date: "", time: "" };
  const l = new Date(at.getTime() + offsetMinutes * 60_000);
  return { date: `${l.getUTCFullYear()}-${pad(l.getUTCMonth() + 1)}-${pad(l.getUTCDate())}`, time: `${pad(l.getUTCHours())}:${pad(l.getUTCMinutes())}` };
}

/** Start of the workspace-local day that contains `at`, as an instant. */
export function startOfLocalDay(at: Date, offsetMinutes = WORKSPACE_UTC_OFFSET_MINUTES): Date {
  const { date } = instantToLocal(at, offsetMinutes);
  return localToInstant(date, "00:00", offsetMinutes)!;
}
