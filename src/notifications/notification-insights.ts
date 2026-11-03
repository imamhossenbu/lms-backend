import { NOTIFICATION_CATEGORIES, NOTIFICATION_CHANNELS } from "./notifications.constants";
import type { DeliveryStats, NotificationCategory, NotificationChannel } from "./notifications.types";

/** Pure number crunching for the Notifications pages (backend copy of the panel's lib/notificationStats.ts). */

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);

export interface DeliveryRowLike {
  userId: string;
  channel: string;
  status: string;
  openedAt?: Date | null;
}

/** Delivery funnel. OPENED/CLICKED rows also count as delivered/opened. */
export function deliveryStats(rows: DeliveryRowLike[]): DeliveryStats {
  const total = rows.length;
  const failed = rows.filter((r) => r.status === "FAILED").length;
  const delivered = total - failed;
  const opened = rows.filter((r) => r.status === "OPENED" || r.status === "CLICKED").length;
  const clicked = rows.filter((r) => r.status === "CLICKED").length;
  return {
    total,
    delivered,
    failed,
    opened,
    clicked,
    deliveryRate: pct(delivered, total),
    openRate: pct(opened, delivered),
    clickRate: pct(clicked, opened),
    recipients: new Set(rows.map((r) => r.userId)).size,
  };
}

export function deliveryByChannel(rows: DeliveryRowLike[]): (DeliveryStats & { channel: NotificationChannel })[] {
  return NOTIFICATION_CHANNELS.map((channel) => ({ channel, ...deliveryStats(rows.filter((r) => r.channel === channel)) })).filter((c) => c.total > 0);
}

/** Opens per hour after sending (first `hours` hours). */
export function opensTimeline(sendAt: Date | null, rows: DeliveryRowLike[], hours = 24) {
  if (!sendAt) return [];
  const start = sendAt.getTime();
  return Array.from({ length: hours }, (_, h) => ({
    label: `${h + 1}h`,
    opens: rows.filter((r) => r.openedAt && r.openedAt.getTime() >= start + h * 3_600_000 && r.openedAt.getTime() < start + (h + 1) * 3_600_000).length,
  }));
}

/** Overview cards of the Broadcasts tab. `sentLast30Rows` = deliveries of broadcasts sent in the last 30 days. */
export function broadcastOverview(counts: { sentLast30: number; scheduled: number; drafts: number }, sentLast30Rows: DeliveryRowLike[]) {
  const s = deliveryStats(sentLast30Rows);
  return { ...counts, avgOpenRate: s.openRate, avgClickRate: s.clickRate, reached: s.recipients };
}

export interface InboxRowLike {
  category: NotificationCategory;
  priority: string;
  isRead: boolean;
  isArchived: boolean;
}

export function inboxStats(inbox: InboxRowLike[]) {
  const live = inbox.filter((n) => !n.isArchived);
  return {
    total: live.length,
    unread: live.filter((n) => !n.isRead).length,
    highPriority: live.filter((n) => !n.isRead && n.priority === "HIGH").length,
    archived: inbox.length - live.length,
  };
}

export const unreadByCategory = (inbox: InboxRowLike[]) =>
  inbox
    .filter((n) => !n.isRead && !n.isArchived)
    .reduce<Partial<Record<NotificationCategory, number>>>((a, n) => ((a[n.category] = (a[n.category] ?? 0) + 1), a), {});

export const isCategory = (v: string): v is NotificationCategory => NOTIFICATION_CATEGORIES.includes(v as NotificationCategory);
