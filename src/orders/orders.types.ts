/**
 * Admin Orders / Payments API shapes — field names follow lms-admin-panel src/types/order.ts (OrderItem).
 * Differences by design: dates are ISO strings, `currency` is the order's real currency (e.g. "BDT"),
 * and visual-only values (formatted money, "#ORD-…" prefix, TXN codes) are formatted client-side.
 */
import type { OrderStatusLabel } from "../commerce/order-status";

export type OrderTimelineLabel =
  | "Order Placed"
  | "Payment Completed"
  | "Payment Verified"
  | "Marked as Paid"
  | "Enrollment Created"
  | "Course Access Granted"
  | "Payment Failed"
  | "Order Cancelled"
  | "Order Reopened"
  | "Refund Issued"
  | "Course Access Revoked";

export interface OrderTimelineStep {
  label: OrderTimelineLabel;
  /** Missing while the step is still pending. */
  at?: string;
  by?: string;
  note?: string;
}

export interface CommerceNote {
  id: string;
  author: { id: string; name: string; avatarUrl: string | null };
  content: string;
  createdAt: string;
  updatedAt: string | null;
}

export interface OrderStudent {
  id: string;
  /** e.g. "STU-3F2A9C1" */
  code: string;
  name: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  joinedAt: string;
}

export interface OrderCourse {
  id: string;
  title: string;
  subtitle: string;
  thumbnailUrl: string | null;
  instructor: string;
  price: number;
}

export interface OrderListItem {
  id: string;
  orderNumber: string;
  /** Gateway reference (SSLCommerz tran_id). */
  reference: string;
  student: OrderStudent;
  courses: OrderCourse[];
  isBundle: boolean;
  subtotal: number;
  discount: number;
  tax: number;
  amount: number;
  currency: string;
  couponCode: string | null;
  paymentMethod: string | null;
  paymentAccount: string | null;
  transactionId: string | null;
  status: OrderStatusLabel;
  createdAt: string;
  paidAt: string | null;
  receiptSentAt: string | null;
  manuallyPaid: boolean;
  cancelReason: string | null;
  refundReason: string | null;
  refundedAt: string | null;
  ipAddress: string | null;
  device: string | null;
  referralSource: string;
  notes: string | null;
}

export interface OrderDetails extends OrderListItem {
  student: OrderStudent & { totalCourses: number };
  timeline: OrderTimelineStep[];
  adminNotes: CommerceNote[];
  paymentNotes: CommerceNote[];
  invoiceUrl: string | null;
}

export interface OrderStats {
  total: number;
  /** Sum of paid orders. */
  revenue: number;
  currency: string;
  paid: number;
  pending: number;
  failed: number;
  cancelled: number;
  refunded: number;
}
