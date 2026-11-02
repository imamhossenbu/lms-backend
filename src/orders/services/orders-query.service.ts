import { Injectable, NotFoundException } from "@nestjs/common";
import type { OrderEventType, Prisma } from "../../../generated/prisma";
import { DB_STATUSES_FOR, round2, statusLabel, type OrderStatusLabel } from "../../commerce/order-status";
import type { AuthUser } from "../../common/auth-user";
import { paginated, skipTake, type Paginated } from "../../common/pagination";
import { PrismaService } from "../../prisma/prisma.service";
import { studentIdCode } from "../../students/students.constants";
import type { OrderFiltersDto, OrderQueryDto, OrderView } from "../dto/orders.dto";
import type { CommerceNote, OrderDetails, OrderListItem, OrderStats, OrderTimelineLabel, OrderTimelineStep } from "../orders.types";

const DEFAULT_CURRENCY = "BDT";

/** Order Status column → lifecycle labels. */
const VIEW_STATUSES: Record<OrderView, OrderStatusLabel[]> = {
  Completed: ["Paid"],
  Processing: ["Pending"],
  Cancelled: ["Failed", "Cancelled"],
  Refunded: ["Refunded"],
};

const EVENT_LABEL: Record<OrderEventType, OrderTimelineLabel> = {
  ORDER_PLACED: "Order Placed",
  PAYMENT_COMPLETED: "Payment Completed",
  PAYMENT_VERIFIED: "Payment Verified",
  MARKED_AS_PAID: "Marked as Paid",
  ENROLLMENT_CREATED: "Enrollment Created",
  COURSE_ACCESS_GRANTED: "Course Access Granted",
  PAYMENT_FAILED: "Payment Failed",
  ORDER_CANCELLED: "Order Cancelled",
  ORDER_REOPENED: "Order Reopened",
  REFUND_ISSUED: "Refund Issued",
  COURSE_ACCESS_REVOKED: "Course Access Revoked",
};

export const orderInclude = {
  user: { select: { id: true, name: true, email: true, phone: true, avatar: true, createdAt: true } },
  course: { select: { id: true, title: true, shortDescription: true, thumbnail: true, price: true, instructor: { select: { name: true } } } },
  coupon: { select: { code: true } },
  payments: { where: { status: { in: ["SUCCESS", "REFUNDED"] } }, orderBy: { paidAt: "desc" as const }, take: 1 },
} satisfies Prisma.OrderInclude;
type OrderRow = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

type NoteRow = { id: string; content: string; createdAt: Date; updatedAt: Date; author: { id: string; name: string; avatar: string | null } };
const toNote = (n: NoteRow): CommerceNote => ({
  id: n.id,
  author: { id: n.author.id, name: n.author.name, avatarUrl: n.author.avatar },
  content: n.content,
  createdAt: n.createdAt.toISOString(),
  updatedAt: n.updatedAt.getTime() - n.createdAt.getTime() > 1000 ? n.updatedAt.toISOString() : null,
});

/** Read side of admin Orders / Payments: list with filters, stats, details (timeline + notes). */
@Injectable()
export class OrdersQueryService {
  constructor(private readonly prisma: PrismaService) {}

  /** Orders of students in the admin's workspace. */
  scope(actor: AuthUser): Prisma.OrderWhereInput {
    return { user: { institutionId: actor.institutionId ?? null } };
  }

  async mustFind(actor: AuthUser, id: string) {
    const order = await this.prisma.order.findFirst({ where: { id, ...this.scope(actor) } });
    if (!order) throw new NotFoundException("Order not found.");
    return order;
  }

  private where(actor: AuthUser, f: OrderFiltersDto, opts: { ignoreStatus?: boolean } = {}): Prisma.OrderWhereInput {
    const labels = opts.ignoreStatus ? null : f.status ? [f.status] : f.view ? VIEW_STATUSES[f.view] : null;
    const and: Prisma.OrderWhereInput[] = [this.scope(actor)];
    if (labels) and.push({ status: { in: labels.flatMap((l) => DB_STATUSES_FOR[l]) } });
    if (f.courseId) and.push({ courseId: f.courseId });
    // Legacy gateway orders have no paymentMethod yet — they were all SSLCommerz checkouts.
    if (f.method) and.push(f.method === "SSLCommerz" ? { OR: [{ paymentMethod: "SSLCommerz" }, { paymentMethod: null }] } : { paymentMethod: f.method });
    if (f.from) and.push({ createdAt: { gte: new Date(`${f.from.slice(0, 10)}T00:00:00Z`) } });
    if (f.to) and.push({ createdAt: { lt: new Date(new Date(`${f.to.slice(0, 10)}T00:00:00Z`).getTime() + 86_400_000) } });
    if (f.q)
      and.push({
        OR: [
          { orderNumber: { contains: f.q, mode: "insensitive" } },
          { transactionId: { contains: f.q, mode: "insensitive" } },
          { user: { name: { contains: f.q, mode: "insensitive" } } },
          { user: { email: { contains: f.q, mode: "insensitive" } } },
        ],
      });
    return { AND: and };
  }

  private toListItem(o: OrderRow): OrderListItem {
    const payment = o.payments[0];
    return {
      id: o.id,
      orderNumber: o.orderNumber,
      reference: o.orderNumber,
      student: {
        id: o.user.id,
        code: studentIdCode(o.user.id),
        name: o.user.name,
        email: o.user.email,
        phone: o.user.phone,
        avatarUrl: o.user.avatar,
        joinedAt: o.user.createdAt.toISOString(),
      },
      courses: [
        {
          id: o.course.id,
          title: o.course.title,
          subtitle: o.course.shortDescription,
          thumbnailUrl: o.course.thumbnail,
          instructor: o.course.instructor.name,
          price: round2(Number(o.course.price)),
        },
      ],
      isBundle: false,
      subtotal: round2(Number(o.amount)),
      discount: round2(Number(o.discountAmount)),
      tax: round2(Number(o.taxAmount)),
      amount: round2(Number(o.totalAmount)),
      currency: o.currency,
      couponCode: o.coupon?.code ?? null,
      // Legacy gateway orders keep these on their Payment row.
      paymentMethod: o.paymentMethod ?? (payment ? "SSLCommerz" : null),
      paymentAccount: o.paymentAccount,
      transactionId: o.transactionId ?? payment?.providerTransactionId ?? null,
      status: statusLabel(o.status),
      createdAt: o.createdAt.toISOString(),
      paidAt: (o.paidAt ?? payment?.paidAt)?.toISOString() ?? null,
      receiptSentAt: o.receiptSentAt?.toISOString() ?? null,
      manuallyPaid: o.manuallyPaid,
      cancelReason: o.cancelReason,
      refundReason: o.refundReason,
      refundedAt: o.refundedAt?.toISOString() ?? null,
      ipAddress: o.ipAddress,
      device: o.device,
      referralSource: o.referralSource,
      notes: o.notes,
    };
  }

  async list(actor: AuthUser, query: OrderQueryDto): Promise<Paginated<OrderListItem>> {
    const where = this.where(actor, query);
    const orderBy: Prisma.OrderOrderByWithRelationInput = query.sortBy === "amount" ? { totalAmount: query.sortOrder } : { createdAt: query.sortOrder };
    const [total, rows] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({ where, include: orderInclude, orderBy: [orderBy, { id: "asc" }], ...skipTake(query) }),
    ]);
    return paginated(rows.map((o) => this.toListItem(o)), total, query);
  }

  /** Stat cards — same filters as the list except the status filters (the cards ARE the status breakdown). */
  async stats(actor: AuthUser, filters: OrderFiltersDto): Promise<OrderStats> {
    const rows = await this.prisma.order.groupBy({
      by: ["status", "currency"],
      where: this.where(actor, filters, { ignoreStatus: true }),
      _count: { _all: true },
      _sum: { totalAmount: true },
    });
    const stats: OrderStats = { total: 0, revenue: 0, currency: rows[0]?.currency ?? DEFAULT_CURRENCY, paid: 0, pending: 0, failed: 0, cancelled: 0, refunded: 0 };
    for (const r of rows) {
      const n = r._count._all;
      stats.total += n;
      const label = statusLabel(r.status);
      if (label === "Paid") stats.revenue += Number(r._sum.totalAmount ?? 0);
      stats[label.toLowerCase() as "paid" | "pending" | "failed" | "cancelled" | "refunded"] += n;
    }
    stats.revenue = round2(stats.revenue);
    return stats;
  }

  /** Stored events, plus synthesized steps for legacy orders and pending placeholders. */
  private timeline(o: OrderRow, events: { type: OrderEventType; at: Date; actorName: string | null; note: string | null }[]): OrderTimelineStep[] {
    const steps: OrderTimelineStep[] = events.map((e) => ({
      label: EVENT_LABEL[e.type],
      at: e.at.toISOString(),
      ...(e.actorName ? { by: e.actorName } : {}),
      ...(e.note ? { note: e.note } : {}),
    }));
    if (!events.some((e) => e.type === "ORDER_PLACED")) steps.unshift({ label: "Order Placed", at: o.createdAt.toISOString() });

    const status = statusLabel(o.status);
    const paidAt = (o.paidAt ?? o.payments[0]?.paidAt)?.toISOString();
    const hasPaymentStep = steps.some((s) => s.label === "Payment Completed" || s.label === "Payment Verified" || s.label === "Marked as Paid");
    if ((status === "Paid" || status === "Refunded") && !hasPaymentStep && paidAt) {
      // Orders paid before the timeline existed.
      steps.splice(1, 0, { label: "Payment Completed", at: paidAt, by: "System" }, { label: "Enrollment Created", at: paidAt }, { label: "Course Access Granted", at: paidAt });
    }
    if (status === "Pending") steps.push({ label: "Payment Completed" }, { label: "Enrollment Created" }, { label: "Course Access Granted" });
    return steps;
  }

  async detail(actor: AuthUser, id: string): Promise<OrderDetails> {
    const o = await this.prisma.order.findFirst({ where: { id, ...this.scope(actor) }, include: orderInclude });
    if (!o) throw new NotFoundException("Order not found.");
    const author = { select: { id: true, name: true, avatar: true } };
    const [events, notes, invoice, totalCourses] = await Promise.all([
      this.prisma.orderEvent.findMany({ where: { orderId: id }, orderBy: { at: "asc" } }),
      this.prisma.orderNote.findMany({ where: { orderId: id }, orderBy: { createdAt: "desc" }, include: { author } }),
      this.prisma.invoice.findFirst({ where: { orderId: id }, orderBy: { issuedAt: "desc" }, select: { invoiceUrl: true } }),
      this.prisma.enrollment.count({ where: { userId: o.userId } }),
    ]);
    const base = this.toListItem(o);
    return {
      ...base,
      student: { ...base.student, totalCourses },
      timeline: this.timeline(o, events),
      adminNotes: notes.filter((n) => n.scope === "ORDER").map(toNote),
      paymentNotes: notes.filter((n) => n.scope === "PAYMENT").map(toNote),
      invoiceUrl: invoice?.invoiceUrl ?? null,
    };
  }
}
