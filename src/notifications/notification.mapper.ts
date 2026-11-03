import type { Announcement, Notification, NotificationDelivery, NotificationTemplate } from "../../generated/prisma";
import { defaultTemplateFor, TRIGGER_CATEGORY } from "./notification-templates.defaults";
import {
  BROADCAST_AUDIENCES,
  BROADCAST_STATUSES,
  BROADCAST_TYPE,
  DELIVERY_ERRORS,
  DELIVERY_STATUSES,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_PRIORITIES,
  TEMPLATE_TRIGGERS,
} from "./notifications.constants";
import type {
  AdminNotification,
  Broadcast,
  BroadcastDelivery,
  BroadcastFields,
  NotificationCategory,
  NotificationChannel,
  NotificationTemplateItem,
  Recipient,
  TemplateTrigger,
} from "./notifications.types";

/** Row ⇄ panel shape. Legacy rows (free-form strings, missing columns) map defensively. */

const oneOf = <T extends string>(values: readonly T[], v: unknown, fallback: T): T => (values.includes(v as T) ? (v as T) : fallback);
const channelsOf = (v: unknown, fallback: NotificationChannel[] = ["IN_APP"]): NotificationChannel[] => {
  const list = (Array.isArray(v) ? v : []).filter((c): c is NotificationChannel => NOTIFICATION_CHANNELS.includes(c as NotificationChannel));
  return list.length ? [...new Set(list)] : fallback;
};
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&#x27;": "'", "&nbsp;": " " };

/** Rich-text HTML → plain text with line breaks (in-app message, emails, legacy `message` column). */
export function htmlToText(html: string): string {
  return (html ?? "")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*\/\s*(p|li|h[1-6]|blockquote|pre|div)\s*>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "• ")
    .replace(/<[^>]*>/g, "")
    .replace(/&(amp|lt|gt|quot|#39|#x27|nbsp);/g, (m) => ENTITIES[m] ?? m)
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Fill `{key}` (panel) and legacy `{{key}}` placeholders; unknown ones are left as-is. */
export function renderTemplate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{?\s*([a-zA-Z_]+)\s*\}?\}/g, (m, key: string) => (key in vars ? vars[key] : m));
}

/** Template slugs are globally unique in the table: "<institutionId|default>:<trigger-slug>". */
export const triggerSlug = (trigger: TemplateTrigger) => trigger.toLowerCase().replace(/_/g, "-");
export const templateSlug = (institutionId: string | null | undefined, trigger: TemplateTrigger) => `${institutionId ?? "default"}:${triggerSlug(trigger)}`;

export const categoryOf = (v: unknown): NotificationCategory => {
  if (NOTIFICATION_CATEGORIES.includes(v as NotificationCategory)) return v as NotificationCategory;
  if (TEMPLATE_TRIGGERS.includes(v as TemplateTrigger)) return TRIGGER_CATEGORY[v as TemplateTrigger];
  return "SYSTEM";
};

export function toInboxItem(n: Notification): AdminNotification {
  return {
    id: n.id,
    // Legacy rows only have `type` (e.g. "ACHIEVEMENT"); fall back to it, then SYSTEM.
    category: n.category && n.category !== "SYSTEM" ? categoryOf(n.category) : categoryOf(n.type),
    priority: oneOf(NOTIFICATION_PRIORITIES, n.priority, "NORMAL"),
    title: n.title,
    message: n.message,
    href: n.href ?? "",
    isRead: n.isRead,
    isArchived: n.isArchived ?? false,
    createdAt: n.createdAt.toISOString(),
  };
}

/** Legacy announcements had no audience/channel columns: they were in-app posts to one course. */
export function toBroadcast(a: Announcement, authorName: string): Broadcast {
  const courseIds = a.courseIds?.length ? a.courseIds : a.courseId ? [a.courseId] : [];
  const status = oneOf(BROADCAST_STATUSES, a.status, "SENT");
  return {
    id: a.id,
    title: a.title,
    messageHtml: a.messageHtml || escapeText(a.message),
    audience: oneOf(BROADCAST_AUDIENCES, a.audience, "COURSE"),
    courseIds,
    channels: channelsOf(a.channels),
    priority: oneOf(NOTIFICATION_PRIORITIES, a.priority, "NORMAL"),
    ctaLabel: a.ctaLabel ?? "",
    ctaUrl: a.ctaUrl ?? "",
    status,
    sendAt: iso(a.sendAt) ?? (status === "SENT" ? a.createdAt.toISOString() : null),
    createdBy: authorName,
    createdAt: a.createdAt.toISOString(),
    updatedAt: (a.updatedAt ?? a.createdAt).toISOString(),
  };
}

const escapeText = (text: string) =>
  text
    ? `<p>${text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!).replace(/\n/g, "<br>")}</p>`
    : "";

/** Back to form fields (edit + duplicate). */
export function fieldsOf(b: Broadcast): BroadcastFields {
  return {
    title: b.title,
    messageHtml: b.messageHtml,
    audience: b.audience,
    courseIds: b.courseIds,
    channels: b.channels,
    priority: b.priority,
    ctaLabel: b.ctaLabel,
    ctaUrl: b.ctaUrl,
    timing: b.status === "SCHEDULED" ? "SCHEDULE" : "NOW",
    scheduledAt: b.sendAt ?? "",
  };
}

/** Columns written for a broadcast (legacy readers get courseId / message / targetRole too). */
export function toBroadcastData(f: BroadcastFields, sendAt: Date | null) {
  const courseIds = f.audience === "COURSE" ? [...new Set(f.courseIds)] : [];
  return {
    title: f.title,
    messageHtml: f.messageHtml,
    message: htmlToText(f.messageHtml),
    audience: f.audience,
    courseIds,
    courseId: courseIds.length === 1 ? courseIds[0] : "",
    targetRole: f.audience === "INSTRUCTORS" ? "TEACHER" : "STUDENT",
    channels: [...new Set(f.channels)],
    priority: f.priority,
    ctaLabel: f.ctaLabel,
    ctaUrl: f.ctaUrl,
    sendAt,
  };
}

export function toDelivery(d: NotificationDelivery & { user: { id: string; name: string; email: string } | null }): BroadcastDelivery {
  return {
    id: d.id,
    broadcastId: d.broadcastId,
    recipient: { id: d.userId, name: d.user?.name ?? "Deleted user", email: d.user?.email ?? "" },
    channel: oneOf(NOTIFICATION_CHANNELS, d.channel, "IN_APP"),
    status: oneOf(DELIVERY_STATUSES, d.status, "DELIVERED"),
    error: d.error ?? "",
    deliveredAt: iso(d.deliveredAt),
    openedAt: iso(d.openedAt),
    clickedAt: iso(d.clickedAt),
  };
}

export function toTemplateItem(t: NotificationTemplate, sentLast30: number): NotificationTemplateItem {
  const trigger = oneOf(TEMPLATE_TRIGGERS, t.trigger, "ENROLLMENT_CONFIRMED");
  const fallback = defaultTemplateFor(trigger);
  return {
    id: t.id,
    slug: triggerSlug(trigger),
    trigger,
    name: t.name || fallback.name,
    subject: t.title,
    body: t.message,
    channels: channelsOf(t.channels, fallback.channels),
    enabled: t.locked ? true : t.enabled,
    locked: t.locked,
    sentLast30,
    updatedAt: (t.updatedAt ?? new Date(0)).toISOString(),
  };
}

// ---------------------------------------------------------------- delivery plan

export interface BroadcastToSend {
  id: string;
  title: string;
  messageHtml: string;
  channels: NotificationChannel[];
  priority: string;
  ctaUrl: string;
}

export interface DeliveryPlan {
  notifications: {
    id: string;
    userId: string;
    institutionId: string | null;
    title: string;
    message: string;
    type: string;
    category: NotificationCategory;
    priority: string;
    href: string;
    broadcastId: string;
    createdAt: Date;
  }[];
  deliveries: {
    id: string;
    broadcastId: string;
    userId: string;
    channel: NotificationChannel;
    status: "DELIVERED" | "FAILED";
    error: string;
    notificationId: string | null;
    deliveredAt: Date | null;
  }[];
  /** Emails to send; a rejected send turns its delivery FAILED. */
  emails: { deliveryId: string; to: string; name: string }[];
}

/**
 * Pure: who gets what on which channel. IN_APP → a Notification row per recipient; EMAIL → a pending send
 * (assumed delivered until the mailer rejects it); PUSH → FAILED (no device tokens are registered yet).
 */
export function planBroadcastDelivery(b: BroadcastToSend, recipients: Recipient[], now: Date, newId: () => string): DeliveryPlan {
  const plan: DeliveryPlan = { notifications: [], deliveries: [], emails: [] };
  const message = htmlToText(b.messageHtml);
  const seen = new Set<string>();
  for (const r of recipients) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    for (const channel of new Set(b.channels)) {
      const deliveryId = newId();
      const base = { id: deliveryId, broadcastId: b.id, userId: r.id, channel, notificationId: null as string | null };
      if (channel === "IN_APP") {
        const notificationId = newId();
        plan.notifications.push({
          id: notificationId,
          userId: r.id,
          institutionId: r.institutionId,
          title: b.title,
          message,
          type: BROADCAST_TYPE,
          category: "SYSTEM",
          priority: b.priority,
          href: b.ctaUrl,
          broadcastId: b.id,
          createdAt: now,
        });
        plan.deliveries.push({ ...base, notificationId, status: "DELIVERED", error: "", deliveredAt: now });
      } else if (channel === "EMAIL") {
        if (!r.email) {
          plan.deliveries.push({ ...base, status: "FAILED", error: DELIVERY_ERRORS.noEmail, deliveredAt: null });
        } else {
          plan.deliveries.push({ ...base, status: "DELIVERED", error: "", deliveredAt: now });
          plan.emails.push({ deliveryId, to: r.email, name: r.name });
        }
      } else {
        plan.deliveries.push({ ...base, status: "FAILED", error: DELIVERY_ERRORS.push, deliveredAt: null });
      }
    }
  }
  return plan;
}

/** Email body for a broadcast: plain text + the call-to-action link. */
export function broadcastEmailBody(b: { messageHtml: string; ctaLabel: string; ctaUrl: string }, appUrl = ""): string {
  const text = htmlToText(b.messageHtml);
  if (!b.ctaLabel || !b.ctaUrl) return text;
  const url = b.ctaUrl.startsWith("/") ? `${appUrl.replace(/\/$/, "")}${b.ctaUrl}` : b.ctaUrl;
  return `${text}\n\n${b.ctaLabel}: ${url}`;
}
