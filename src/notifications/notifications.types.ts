import type {
  BROADCAST_AUDIENCES,
  BROADCAST_STATUSES,
  BROADCAST_TIMINGS,
  DELIVERY_STATUSES,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_PRIORITIES,
  TEMPLATE_TRIGGERS,
} from "./notifications.constants";

/** Shapes returned to the admin panel — exactly lms-admin-panel src/types/notification.ts. */

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];
export type NotificationPriority = (typeof NOTIFICATION_PRIORITIES)[number];
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];
export type BroadcastAudience = (typeof BROADCAST_AUDIENCES)[number];
export type BroadcastStatus = (typeof BROADCAST_STATUSES)[number];
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];
export type BroadcastTiming = (typeof BROADCAST_TIMINGS)[number];
export type TemplateTrigger = (typeof TEMPLATE_TRIGGERS)[number];

/** Inbox item (admin inbox + the student/user-facing /notification API). */
export interface AdminNotification {
  id: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  title: string;
  message: string;
  href: string;
  isRead: boolean;
  isArchived: boolean;
  createdAt: string;
}

export interface Broadcast {
  id: string;
  title: string;
  messageHtml: string;
  audience: BroadcastAudience;
  courseIds: string[];
  channels: NotificationChannel[];
  priority: NotificationPriority;
  ctaLabel: string;
  ctaUrl: string;
  status: BroadcastStatus;
  sendAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface BroadcastDelivery {
  id: string;
  broadcastId: string;
  recipient: { id: string; name: string; email: string };
  channel: NotificationChannel;
  status: DeliveryStatus;
  error: string;
  deliveredAt: string | null;
  openedAt: string | null;
  clickedAt: string | null;
}

export interface NotificationTemplateItem {
  id: string;
  slug: string;
  trigger: TemplateTrigger;
  name: string;
  subject: string;
  body: string;
  channels: NotificationChannel[];
  enabled: boolean;
  locked: boolean;
  sentLast30: number;
  updatedAt: string;
}

/** Fields of the compose form after validation + normalisation (what the rules check). */
export interface BroadcastFields {
  title: string;
  messageHtml: string;
  audience: BroadcastAudience;
  courseIds: string[];
  channels: NotificationChannel[];
  priority: NotificationPriority;
  ctaLabel: string;
  ctaUrl: string;
  timing: BroadcastTiming;
  /** "YYYY-MM-DDTHH:mm" (workspace local) or an ISO instant; "" when sending now. */
  scheduledAt: string;
}

export interface DeliveryStats {
  total: number;
  delivered: number;
  failed: number;
  opened: number;
  clicked: number;
  deliveryRate: number;
  openRate: number;
  clickRate: number;
  recipients: number;
}

/** Broadcasts table row: the broadcast + its numbers + course titles (for the audience column). */
export interface BroadcastListItem extends Broadcast {
  /** Unique recipients (sent) or the live estimate (not sent yet). */
  recipients: number;
  /** Open rate % for sent broadcasts, null otherwise. */
  openRate: number | null;
  courses: { id: string; title: string }[];
}

export interface BroadcastDetail {
  broadcast: Broadcast;
  courses: { id: string; title: string }[];
  /** Recipients estimate for unsent broadcasts; unique recipients for sent ones. */
  recipients: number;
  stats: DeliveryStats;
  byChannel: (DeliveryStats & { channel: NotificationChannel })[];
  opensTimeline: { label: string; opens: number }[];
}

/** A user who receives a broadcast. */
export interface Recipient {
  id: string;
  name: string;
  email: string;
  institutionId: string | null;
}
