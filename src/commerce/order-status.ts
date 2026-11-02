/**
 * One order lifecycle shared by checkout callbacks and the admin panel — mirrors
 * lms-admin-panel src/lib/orderActions.ts: PENDING → PAID | FAILED | CANCELLED, PAID → REFUNDED.
 * The panel shows it as "Order Status" and "Payment Status" columns; the API returns the label.
 */

export type OrderStatusLabel = "Paid" | "Pending" | "Failed" | "Cancelled" | "Refunded";
export type DbOrderStatus = "PAID" | "PENDING" | "FAILED" | "CANCELLED" | "REFUNDED";
export type StatusScope = "order" | "payment";

export const ORDER_STATUS_LABELS = ["Paid", "Pending", "Failed", "Cancelled", "Refunded"] as const;
export const PAYMENT_METHODS = ["Stripe", "PayPal", "SSLCommerz", "bKash", "Nagad"] as const;
export type PaymentMethodLabel = (typeof PAYMENT_METHODS)[number];

export const toDbStatus = (label: OrderStatusLabel) => label.toUpperCase() as DbOrderStatus;

/** Legacy rows may hold other spellings (e.g. "delivered" for a fulfilled paid order). */
export function statusLabel(db: string): OrderStatusLabel {
  switch (db.toUpperCase()) {
    case "PAID":
    case "DELIVERED":
    case "COMPLETED":
      return "Paid";
    case "FAILED":
      return "Failed";
    case "CANCELLED":
    case "CANCELED":
      return "Cancelled";
    case "REFUNDED":
      return "Refunded";
    default:
      return "Pending";
  }
}

/** DB spellings that count as each label (for filtering). */
export const DB_STATUSES_FOR: Record<OrderStatusLabel, string[]> = {
  Paid: ["PAID", "delivered", "DELIVERED", "COMPLETED"],
  Pending: ["PENDING"],
  Failed: ["FAILED"],
  Cancelled: ["CANCELLED", "CANCELED"],
  Refunded: ["REFUNDED"],
};

/**
 * Allowed admin transitions. The Orders page manages the order (confirm, fail, cancel, reopen);
 * the Payments page manages the money (confirm, fail, refund).
 */
export const TRANSITIONS: Record<StatusScope, Record<OrderStatusLabel, OrderStatusLabel[]>> = {
  order: {
    Pending: ["Paid", "Failed", "Cancelled"],
    Failed: ["Pending", "Cancelled"],
    Cancelled: ["Pending"],
    Paid: [],
    Refunded: [],
  },
  payment: {
    Pending: ["Paid", "Failed"],
    Paid: ["Refunded"],
    Failed: ["Pending"],
    Cancelled: [],
    Refunded: [],
  },
};

/** Preset reasons per destructive target ("Other" needs details) — same lists as the panel. */
export const STATUS_REASONS = {
  Failed: ["Payment declined", "Insufficient funds", "Gateway timeout", "Suspected fraud", "Other"],
  Cancelled: ["Payment not received", "Requested by student", "Duplicate order", "Suspected fraud", "Other"],
  Refunded: ["Requested by student", "Duplicate payment", "Course content issue", "Technical problem", "Other"],
} as const;

export const statusNeedsReason = (target: string): target is keyof typeof STATUS_REASONS => target in STATUS_REASONS;

export const round2 = (n: number) => Math.round(n * 100) / 100;
