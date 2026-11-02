import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import type { Order, OrderNoteScope } from "../../../generated/prisma";
import { Prisma } from "../../../generated/prisma";
import { MailService } from "../../auth/mail/mail.service";
import { OrderLifecycleService } from "../../commerce/order-lifecycle.service";
import { round2, statusLabel, type StatusScope } from "../../commerce/order-status";
import { SslCommerzService } from "../../commerce/sslcommerz.service";
import { tenantWhere, type AuthUser } from "../../common/auth-user";
import { InvoiceService } from "../../invoice/invoice.service";
import { PrismaService } from "../../prisma/prisma.service";
import type { AdditionalInfoDto, ChangeStatusDto, CreateOrderDto, EditPaymentDto } from "../dto/orders.dto";
import type { OrderDetails } from "../orders.types";
import { OrdersQueryService } from "./orders-query.service";

const DEFAULT_CURRENCY = "BDT";

/** Admin actions on orders / payments. Status changes always go through OrderLifecycleService. */
@Injectable()
export class OrderAdminService {
  private readonly logger = new Logger(OrderAdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly query: OrdersQueryService,
    private readonly lifecycle: OrderLifecycleService,
    private readonly gateway: SslCommerzService,
    private readonly invoices: InvoiceService,
    private readonly mail: MailService,
  ) {}

  private async actorName(actor: AuthUser) {
    return (await this.prisma.user.findUnique({ where: { id: actor.userId }, select: { name: true } }))?.name ?? "Admin";
  }

  // ---------------------------------------------------------------- create

  /** Coupon discount for one course, or 0. Throws a friendly error for unusable codes. */
  private async couponFor(code: string, courseId: string, price: number) {
    const coupon = await this.prisma.coupon.findFirst({ where: { code: { equals: code, mode: "insensitive" } } });
    if (!coupon || coupon.status !== "ACTIVE") throw new BadRequestException(`Coupon ${code.toUpperCase()} doesn't exist or isn't active.`);
    const now = new Date();
    if (coupon.courseId !== courseId) throw new BadRequestException(`Coupon ${coupon.code} doesn't apply to this course.`);
    if (now < coupon.startDate || now > coupon.endDate) throw new BadRequestException(`Coupon ${coupon.code} isn't valid today.`);
    if (coupon.usedCount >= coupon.maxUses) throw new BadRequestException(`Coupon ${coupon.code} has reached its usage limit.`);
    const value = Number(coupon.discountTypeValue);
    const discount = coupon.discountType === "PERCENTAGE" ? (price * value) / 100 : value;
    return { coupon, discount: round2(Math.min(price, Math.max(0, discount))) };
  }

  /** Manual order (offline / bank payment), optionally already paid. */
  async create(actor: AuthUser, dto: CreateOrderDto, meta: { ip?: string }): Promise<OrderDetails> {
    const student = await this.prisma.user.findFirst({ where: { id: dto.studentId, role: "STUDENT", deletedAt: null, ...tenantWhere(actor) } });
    if (!student) throw new NotFoundException("Student not found.");
    const course = await this.prisma.course.findUnique({ where: { id: dto.courseId } });
    if (!course) throw new NotFoundException("Course not found.");
    if (await this.prisma.order.count({ where: { userId: student.id, courseId: course.id, status: "PAID" } }))
      throw new ConflictException(`${student.name} has already bought this course.`);

    const price = round2(Number(course.price));
    const applied = dto.couponCode ? await this.couponFor(dto.couponCode, course.id, price) : null;
    const discount = applied?.discount ?? 0;
    const by = await this.actorName(actor);

    const orderId = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          orderNumber: `ORD-${Date.now()}`,
          userId: student.id,
          courseId: course.id,
          amount: new Prisma.Decimal(price),
          discountAmount: new Prisma.Decimal(discount),
          taxAmount: new Prisma.Decimal(0),
          totalAmount: new Prisma.Decimal(round2(price - discount)),
          currency: DEFAULT_CURRENCY,
          status: "PENDING",
          couponId: applied?.coupon.id ?? null,
          paymentMethod: dto.method,
          ipAddress: meta.ip ?? null,
          device: "Created by admin",
          referralSource: "Direct",
        },
      });
      if (applied) {
        await tx.coupon.update({ where: { id: applied.coupon.id }, data: { usedCount: { increment: 1 } } });
        await tx.couponUsage.create({ data: { couponId: applied.coupon.id, userId: student.id, orderId: order.id, discountAmount: new Prisma.Decimal(discount) } });
      }
      await this.lifecycle.placed(tx, order.id, by);
      if (dto.note) await tx.orderNote.create({ data: { orderId: order.id, scope: "ORDER", authorId: actor.userId, content: dto.note } });
      if (dto.markAsPaid)
        await this.lifecycle.markPaid(tx, order, { kind: "MANUAL", method: dto.method, transactionId: dto.reference!, paidAt: new Date(), actorName: by, note: `Manual ${dto.method} payment · Ref ${dto.reference}` });
      return order.id;
    });
    return this.query.detail(actor, orderId);
  }

  // ---------------------------------------------------------------- status

  /** Combines the preset reason with optional details ("Other" requires 10+ characters of details). */
  private reasonText(dto: ChangeStatusDto) {
    if (dto.reason === "Other") {
      if (dto.details.length < 10) throw new BadRequestException("Please describe the reason (at least 10 characters)");
      return dto.details;
    }
    return dto.details ? `${dto.reason} — ${dto.details}` : dto.reason!;
  }

  async changeStatus(actor: AuthUser, id: string, scope: StatusScope, dto: ChangeStatusDto): Promise<OrderDetails> {
    const order = await this.query.mustFind(actor, id);
    this.lifecycle.assertTransition(order, dto.target, scope);
    const by = await this.actorName(actor);

    await this.prisma.$transaction(async (tx) => {
      switch (dto.target) {
        case "Paid": {
          const today = new Date().toISOString().slice(0, 10);
          if (dto.paidOn! > today) throw new BadRequestException("Payment date can't be in the future");
          await this.lifecycle.markPaid(tx, order, {
            kind: "MANUAL",
            method: dto.method!,
            transactionId: dto.reference!,
            paidAt: new Date(`${dto.paidOn}T12:00:00Z`),
            actorName: by,
            note: `Manual ${dto.method} payment · Ref ${dto.reference}`,
          });
          if (dto.details) await tx.orderNote.create({ data: { orderId: id, scope: "PAYMENT", authorId: actor.userId, content: dto.details } });
          return;
        }
        case "Failed":
          return this.lifecycle.fail(tx, order, this.reasonText(dto), by);
        case "Cancelled":
          return this.lifecycle.cancel(tx, order, this.reasonText(dto), by);
        case "Refunded":
          return this.lifecycle.refund(tx, order, this.reasonText(dto), by);
        case "Pending":
          await this.lifecycle.reopen(tx, order, dto.details || null, by);
          if (dto.details) await tx.orderNote.create({ data: { orderId: id, scope: "ORDER", authorId: actor.userId, content: dto.details } });
          return;
      }
    });
    return this.query.detail(actor, id);
  }

  /** Asks SSLCommerz whether this pending order was actually paid (e.g. the redirect never reached us). */
  async verify(actor: AuthUser, id: string): Promise<{ paid: boolean; order: OrderDetails }> {
    const order = await this.query.mustFind(actor, id);
    if (statusLabel(order.status) !== "Pending") throw new BadRequestException("Only pending orders can be verified.");
    let tx;
    try {
      tx = await this.gateway.findPaidByTranId(order.orderNumber);
    } catch {
      throw new ServiceUnavailableException("The payment gateway didn't respond. Try again in a minute.");
    }
    if (!tx || Math.abs(tx.amount - round2(Number(order.totalAmount))) > 0.01) return { paid: false, order: await this.query.detail(actor, id) };

    const by = await this.actorName(actor);
    await this.prisma.$transaction((t) =>
      this.lifecycle.markPaid(t, order, {
        kind: "VERIFIED",
        method: "SSLCommerz",
        account: SslCommerzService.maskedAccount(tx),
        transactionId: tx.bankTranId || tx.valId,
        paidAt: new Date(),
        actorName: by,
        note: "Confirmed with the payment gateway",
        gatewayResponse: tx.raw,
      }),
    );
    return { paid: true, order: await this.query.detail(actor, id) };
  }

  // ---------------------------------------------------------------- other edits

  async updateAdditionalInfo(actor: AuthUser, id: string, dto: AdditionalInfoDto): Promise<OrderDetails> {
    const order = await this.prisma.order.findFirst({ where: { id, ...this.query.scope(actor) }, include: { coupon: { select: { code: true } } } });
    if (!order) throw new NotFoundException("Order not found.");
    const current = order.coupon?.code ?? "";
    if ((dto.couponCode ?? "").toUpperCase() !== current.toUpperCase()) throw new BadRequestException("Coupons can't be changed after the order is placed.");
    await this.prisma.order.update({ where: { id }, data: { referralSource: dto.referralSource, notes: dto.notes || null } });
    return this.query.detail(actor, id);
  }

  async editPayment(actor: AuthUser, id: string, dto: EditPaymentDto): Promise<OrderDetails> {
    const order = await this.query.mustFind(actor, id);
    const status = statusLabel(order.status);
    const hasMoney = status === "Paid" || status === "Refunded";
    if (!hasMoney && dto.reference) throw new BadRequestException("Unpaid payments don't have a transaction reference yet.");
    await this.prisma.order.update({
      where: { id },
      data: { paymentMethod: dto.method, paymentAccount: dto.account, ...(hasMoney && dto.reference ? { transactionId: dto.reference } : {}) },
    });
    return this.query.detail(actor, id);
  }

  // ---------------------------------------------------------------- notes

  async addNote(actor: AuthUser, id: string, scope: OrderNoteScope, content: string): Promise<OrderDetails> {
    await this.query.mustFind(actor, id);
    await this.prisma.orderNote.create({ data: { orderId: id, scope, authorId: actor.userId, content } });
    return this.query.detail(actor, id);
  }

  private async mustNote(orderId: string, noteId: string, scope: OrderNoteScope) {
    const note = await this.prisma.orderNote.findFirst({ where: { id: noteId, orderId, scope } });
    if (!note) throw new NotFoundException("This note no longer exists.");
    return note;
  }

  async updateNote(actor: AuthUser, id: string, scope: OrderNoteScope, noteId: string, content: string): Promise<OrderDetails> {
    await this.query.mustFind(actor, id);
    const note = await this.mustNote(id, noteId, scope);
    if (note.authorId !== actor.userId) throw new ForbiddenException("Only the author can edit this note.");
    await this.prisma.orderNote.update({ where: { id: noteId }, data: { content } });
    return this.query.detail(actor, id);
  }

  async deleteNote(actor: AuthUser, id: string, scope: OrderNoteScope, noteId: string): Promise<OrderDetails> {
    await this.query.mustFind(actor, id);
    await this.mustNote(id, noteId, scope);
    await this.prisma.orderNote.delete({ where: { id: noteId } });
    return this.query.detail(actor, id);
  }

  // ---------------------------------------------------------------- invoice / receipt

  /** Latest invoice PDF for a paid / refunded order (generated on first request). */
  async invoiceUrl(actor: AuthUser, id: string): Promise<{ invoiceUrl: string }> {
    const order = await this.query.mustFind(actor, id);
    const status = statusLabel(order.status);
    if (status !== "Paid" && status !== "Refunded") throw new BadRequestException("Invoices exist only for paid orders.");
    return { invoiceUrl: await this.ensureInvoice(order) };
  }

  private async ensureInvoice(order: Order) {
    const existing = await this.prisma.invoice.findFirst({ where: { orderId: order.id }, orderBy: { issuedAt: "desc" } });
    if (existing) return existing.invoiceUrl;
    try {
      return (await this.invoices.generateInvoice(order.id)).invoiceUrl;
    } catch (err: any) {
      this.logger.error(`Invoice generation failed for ${order.orderNumber}: ${err?.message ?? err}`);
      throw new ServiceUnavailableException("We couldn't create the invoice right now. Please try again.");
    }
  }

  /** Emails the receipt (invoice link) to the student. */
  async sendReceipt(actor: AuthUser, id: string): Promise<OrderDetails> {
    const order = await this.query.mustFind(actor, id);
    if (statusLabel(order.status) !== "Paid") throw new BadRequestException("Receipts can only be sent for paid orders.");
    const invoiceUrl = await this.ensureInvoice(order);
    const [student, course] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: order.userId }, select: { name: true, email: true } }),
      this.prisma.course.findUniqueOrThrow({ where: { id: order.courseId }, select: { title: true } }),
    ]);
    try {
      await this.mail.sendOrderReceiptEmail(student.email, student.name, order.orderNumber, course.title, round2(Number(order.totalAmount)), order.currency, invoiceUrl);
    } catch (err: any) {
      this.logger.error(`Receipt email for ${order.orderNumber} failed: ${err?.message ?? err}`);
      throw new ServiceUnavailableException("We couldn't send the email right now. Please try again in a few minutes.");
    }
    await this.prisma.order.update({ where: { id }, data: { receiptSentAt: new Date() } });
    return this.query.detail(actor, id);
  }
}
