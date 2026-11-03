import { localToInstant } from "../common/workspace-time";
import { LIVE_LIMITS, PLATFORM_HOSTS, PLATFORM_NAME } from "./live-classes.constants";
import type { LiveClassFields } from "./live-classes.types";

/** Cross-field rules from the panel's liveClassSchema superRefine + startsInFuture. Pure. */

const toMinutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

export function liveClassRuleErrors(f: LiveClassFields, opts: { requireFuture: boolean; now?: Date }): string[] {
  const errors: string[] = [];
  const d = toMinutes(f.endTime) - toMinutes(f.startTime);
  if (d <= 0) errors.push("End time must be after the start time");
  else if (d < LIVE_LIMITS.minMinutes) errors.push(`A class must be at least ${LIVE_LIMITS.minMinutes} minutes`);
  else if (d > LIVE_LIMITS.maxMinutes) errors.push("A class can be at most 8 hours");

  if (f.platform !== "CUSTOM") {
    try {
      if (!PLATFORM_HOSTS[f.platform].test(new URL(f.meetingLink).hostname)) errors.push(`This doesn't look like a ${PLATFORM_NAME[f.platform]} link`);
    } catch {
      /* the DTO already rejected a malformed URL */
    }
  }
  if (f.settings.sendReminder && f.reminder === "NONE") errors.push("Choose when to send the reminder");

  if (opts.requireFuture) {
    const start = localToInstant(f.date, f.startTime);
    if (start && start.getTime() <= (opts.now ?? new Date()).getTime()) errors.push("The class must start in the future");
  }
  return errors;
}

/** Did the schedule move? (re-scheduling must also land in the future) */
export const isRescheduled = (before: Pick<LiveClassFields, "date" | "startTime" | "endTime">, after: Pick<LiveClassFields, "date" | "startTime" | "endTime">) =>
  before.date !== after.date || before.startTime !== after.startTime || before.endTime !== after.endTime;
