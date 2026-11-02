import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import type { Order, OrderEventType, Prisma } from "../../generated/prisma";
import { PrismaService } from "../prisma/prisma.service";
import { statusLabel, TRANSITIONS, type OrderStatusLabel, type StatusScope } from "./order-status";

type Tx = Prisma.TransactionClient;

export interface PaymentConfirmation {
  /** How the money was confirmed — decides the timeline label. */
  kind: "GATEWAY" | "VERIFIED" | "MANUAL";
  method: string;
  account?: string | null;
  transactionId: string;
  paidAt: Date;
  actorName: string;
  note?: string;
  /** Raw gateway payload, stored on the Payment row for audits. */
  gatewayResponse?: unknown;
}

/** Timeline label for each way a payment gets confirmed. */
const CONFIRM_EVENT: Record<PaymentConfirmation["kind"], OrderEventType> = {
  GATEWAY: "PAYMENT_COMPLETED",
  VERIFIED: "PAYMENT_VERIFIED",
  MANUAL: "MARKED_AS_PAID",
};

/**
 * The single place that moves an order between statuses — used by SSLCommerz callbacks, the admin
 * "Verify payment" action and admin status changes. Every transition is a conditional update on the
 * current status, so two concurrent requests can't both apply (e.g. double enrollment / double refund).
 */
@Injectable()
export class OrderLifecycleService {
  constructor(private readonly prisma: PrismaService) {}

  assertTransition(order: Pick<Order, "status">, target: OrderStatusLabel, scope: StatusScope) {
    const from = statusLabel(order.status);
    if (!TRANSITIONS[scope][from].includes(target))
      throw new BadRequestException(`Can't change a ${from.toLowerCase()} ${scope} to ${target.toLowerCase()}.`);
  }

  private event(tx: Tx, orderId: string, type: OrderEventType, actorName: string | null, note?: string | null, at = new Date()) {
    return tx.orderEvent.create({ data: { orderId, type, actorName, note: note ?? null, at } });
  }

  /** Flips the status only if it is still one of `from`; throws 409 when someone else got there first. */
  private async flip(tx: Tx, orderId: string, from: string[], data: Prisma.OrderUpdateManyMutationInput) {
    const res = await tx.order.updateMany({ where: { id: orderId, status: { in: from } }, data });
    if (res.count === 0) throw new ConflictException("This order was updated by someone else. Refresh and try again.");
  }

  /** Grants course access (idempotent: an existing enrollment is kept, the counter only moves once). */
  private async grantAccess(tx: Tx, userId: string, courseId: string) {
    const created = await tx.enrollment.createMany({ data: [{ userId, courseId, status: "ACTIVE" }], skipDuplicates: true });
    if (created.count) await tx.course.update({ where: { id: courseId }, data: { totalStudents: { increment: 1 } } });
  }

  /** Revokes course access unless another paid order still covers the same course. */
  private async revokeAccess(tx: Tx, order: Pick<Order, "id" | "userId" | "courseId">) {
    const otherPaid = await tx.order.count({ where: { id: { not: order.id }, userId: order.userId, courseId: order.courseId, status: "PAID" } });
    if (otherPaid) return false;
    const removed = await tx.enrollment.deleteMany({ where: { userId: order.userId, courseId: order.courseId } });
    if (removed.count) await tx.course.updateMany({ where: { id: order.courseId, totalStudents: { gt: 0 } }, data: { totalStudents: { decrement: 1 } } });
    return removed.count > 0;
  }

  // ---------------------------------------------------------------- transitions

  /**
   * PENDING (or FAILED, for a later successful gateway retry) → PAID: records the payment,
   * enrolls the student and writes the timeline. Returns false when the order was already paid.
   */
  async markPaid(tx: Tx, order: Order, p: PaymentConfirmation): Promise<boolean> {
    if (statusLabel(order.status) === "Paid") return false;
    const from = p.kind === "MANUAL" || p.kind === "VERIFIED" ? ["PENDING"] : ["PENDING", "FAILED"];
    await this.flip(tx, order.id, from, {
      status: "PAID",
      paidAt: p.paidAt,
      transactionId: p.transactionId,
      paymentMethod: p.method,
      ...(p.account ? { paymentAccount: p.account } : {}),
      manuallyPaid: p.kind === "MANUAL",
      cancelReason: null,
    });
    await tx.payment.create({
      data: {
        orderId: order.id,
        userId: order.userId,
        courseId: order.courseId,
        provider: p.method.toUpperCase(),
        providerTransactionId: p.transactionId,
        amount: order.totalAmount,
        currency: order.currency,
        status: "SUCCESS",
        gatewayResponse: JSON.stringify(p.gatewayResponse ?? { manual: true, by: p.actorName }),
        paidAt: p.paidAt,
      },
    });
    await this.grantAccess(tx, order.userId, order.courseId);
    const now = new Date();
    await this.event(tx, order.id, CONFIRM_EVENT[p.kind], p.actorName, p.note ?? null, p.kind === "GATEWAY" ? p.paidAt : now);
    await this.event(tx, order.id, "ENROLLMENT_CREATED", "System", null, now);
    await this.event(tx, order.id, "COURSE_ACCESS_GRANTED", "System", null, now);
    return true;
  }

  async fail(tx: Tx, order: Order, reason: string, actorName: string) {
    await this.flip(tx, order.id, ["PENDING"], { status: "FAILED", transactionId: null });
    await this.event(tx, order.id, "PAYMENT_FAILED", actorName, reason);
  }

  async cancel(tx: Tx, order: Order, reason: string, actorName: string) {
    await this.flip(tx, order.id, ["PENDING", "FAILED"], { status: "CANCELLED", cancelReason: reason });
    await this.event(tx, order.id, "ORDER_CANCELLED", actorName, reason);
  }

  async reopen(tx: Tx, order: Order, note: string | null, actorName: string) {
    await this.flip(tx, order.id, ["FAILED", "CANCELLED"], { status: "PENDING", transactionId: null, paidAt: null, cancelReason: null });
    await this.event(tx, order.id, "ORDER_REOPENED", actorName, note || "Awaiting a new payment");
  }

  /** PAID → REFUNDED: marks the payments refunded and revokes course access. */
  async refund(tx: Tx, order: Order, reason: string, actorName: string) {
    const now = new Date();
    await this.flip(tx, order.id, ["PAID", "DELIVERED", "delivered", "COMPLETED"], { status: "REFUNDED", refundReason: reason, refundedAt: now });
    await tx.payment.updateMany({ where: { orderId: order.id, status: "SUCCESS" }, data: { status: "REFUNDED" } });
    await this.event(tx, order.id, "REFUND_ISSUED", actorName, reason, now);
    if (await this.revokeAccess(tx, order)) await this.event(tx, order.id, "COURSE_ACCESS_REVOKED", "System", null, now);
  }

  /** Records a placed order on the timeline. */
  placed(tx: Tx, orderId: string, actorName: string | null, at = new Date()) {
    return this.event(tx, orderId, "ORDER_PLACED", actorName, null, at);
  }

  /** Gateway said the payment failed / was cancelled — only affects still-pending orders. */
  async gatewayClosed(orderId: string, outcome: "FAILED" | "CANCELLED", note: string) {
    return this.prisma.$transaction(async (tx) => {
      const res = await tx.order.updateMany({ where: { id: orderId, status: "PENDING" }, data: { status: outcome, ...(outcome === "CANCELLED" ? { cancelReason: note } : {}) } });
      if (res.count) await this.event(tx, orderId, outcome === "FAILED" ? "PAYMENT_FAILED" : "ORDER_CANCELLED", "System", note);
      return res.count > 0;
    });
  }
}
