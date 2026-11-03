import { plainTextLength } from "../common/html";
import { localToInstant } from "../common/workspace-time";
import { TRIGGER_PLACEHOLDERS } from "./notification-templates.defaults";
import { LIMITS } from "./notifications.constants";
import type { BroadcastFields, BroadcastStatus, TemplateTrigger } from "./notifications.types";

/**
 * Cross-field rules the DTO decorators can't express (copied from the panel's broadcastFormSchema /
 * templateEditorSchema superRefine). Pure; returns user-facing messages, empty = valid.
 */

const LOCAL_DATETIME_RE = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?$/;

/** `<input type="datetime-local">` value ("2026-11-20T09:30", workspace local) or an ISO instant → Date. null = invalid/empty. */
export function parseScheduledAt(value: string): Date | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  const local = LOCAL_DATETIME_RE.exec(v);
  if (local) return localToInstant(local[1], local[2]);
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t);
}

export const isHttpOrPath = (v: string) => v.startsWith("/") || /^https?:\/\/[^\s]+\.[^\s]+/.test(v);

export function broadcastRuleErrors(f: BroadcastFields, opts: { asDraft?: boolean; now?: Date } = {}): string[] {
  const errors: string[] = [];
  const now = opts.now ?? new Date();
  if (f.audience === "COURSE" && f.courseIds.length === 0) errors.push("Select at least one course");
  if ((f.ctaLabel && !f.ctaUrl) || (!f.ctaLabel && f.ctaUrl)) errors.push("Add both a button label and a link");
  if (f.ctaUrl && !isHttpOrPath(f.ctaUrl)) errors.push("Use an https:// link or a page path like /courses");
  if (f.channels.includes("PUSH") && plainTextLength(f.messageHtml) > LIMITS.pushMessageMax)
    errors.push(`Push messages must be ${LIMITS.pushMessageMax} characters or less — shorten it or turn off Push`);
  if (f.timing === "SCHEDULE") {
    const at = parseScheduledAt(f.scheduledAt);
    // Drafts may be saved without a (valid / future) time yet.
    if (!opts.asDraft) {
      if (!at) errors.push("Pick a date and time");
      else if (at.getTime() < now.getTime() + LIMITS.scheduleLeadMinutes * 60_000) errors.push(`Schedule at least ${LIMITS.scheduleLeadMinutes} minutes from now`);
    }
  }
  return errors;
}

/** `{placeholder}`s in subject/body must be available for the trigger. */
export function templatePlaceholderErrors(trigger: TemplateTrigger, fields: { subject: string; body: string }): string[] {
  const allowed = TRIGGER_PLACEHOLDERS[trigger];
  const errors: string[] = [];
  for (const field of ["subject", "body"] as const) {
    const unknown = (fields[field].match(/\{[a-z_]+\}/g) ?? []).find((p) => !allowed.includes(p));
    if (unknown) errors.push(`${unknown} isn't available for this event`);
  }
  return errors;
}

/** Lifecycle guards (panel broadcastFormat.ts + notificationStorage.ts). */
export const canEditBroadcast = (s: BroadcastStatus) => s === "DRAFT" || s === "SCHEDULED";
export const canCancelBroadcast = (s: BroadcastStatus) => s === "SCHEDULED";
/** Sent broadcasts are kept for reporting. */
export const canDeleteBroadcast = (s: BroadcastStatus) => s !== "SENT";
