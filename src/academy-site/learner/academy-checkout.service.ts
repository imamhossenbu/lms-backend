import { BadGatewayException, BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import axios from "axios";
import { randomBytes } from "crypto";
import { Prisma } from "../../../generated/prisma";
import { OrderLifecycleService } from "../../commerce/order-lifecycle.service";
import { round2, statusLabel } from "../../commerce/order-status";
import { SslCommerzService } from "../../commerce/sslcommerz.service";
import { InvoiceService } from "../../invoice/invoice.service";
import { PrismaService } from "../../prisma/prisma.service";
import { SAAS_ROOT_DOMAIN } from "../../saas/saas.constants";
import { WorkspaceSettingsReader } from "../../workspace-settings/services/workspace-settings-reader.service";
import { LearnerAuthService } from "./learner-auth.service";

const API_PUBLIC_URL = () => (process.env.API_PUBLIC_URL || `http://localhost:${process.env.PORT || 4000}`).replace(/\/$/, "");
const gatewayBase = () => (process.env.SSL_IS_LIVE === "true" ? "https://securepay.sslcommerz.com" : "https://sandbox.sslcommerz.com");

export interface CheckoutQuote {
  course: { id: string; slug: string; title: string; thumbnail: string | null; instructor: string; level: string; isFree: boolean };
  currency: string;
  price: number;
  discount: number;
  total: number;
  coupon: { code: string; label: string } | null;
  couponError: string | null;
  enrolled: boolean;
}

export type CheckoutStart = { status: "ENROLLED"; orderId: string | null } | { status: "REDIRECT"; gatewayUrl: string; orderId: string };

export interface CheckoutResult {
  orderId: string;
  orderNumber: string;
  status: "PAID" | "PENDING" | "FAILED" | "CANCELLED" | "REFUNDED";
  total: number;
  currency: string;
  paidAt: Date | null;
  method: string | null;
  course: { slug: string; title: string; thumbnail: string | null };
}

/**
 * Course purchase on an academy's website. Free courses enrol straight away; paid ones create a PENDING order
 * and an SSLCommerz session whose callbacks (validated server-to-server) mark the order paid through the shared
 * OrderLifecycleService (which enrols the learner), then send the browser back to the academy site.
 * Coupons are counted only when an order is actually paid.
 */
@Injectable()
export class AcademyCheckoutService {
  private readonly logger = new Logger(AcademyCheckoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly learners: LearnerAuthService,
    private readonly settings: WorkspaceSettingsReader,
    private readonly lifecycle: OrderLifecycleService,
    private readonly ssl: SslCommerzService,
    private readonly invoices: InvoiceService,
  ) {}

  private async course(tenantId: string, courseSlug: string) {
    const c = await this.prisma.course.findFirst({
      where: { institutionId: tenantId, slug: courseSlug, status: "PUBLISHED" },
      select: { id: true, slug: true, title: true, thumbnail: true, level: true, isFree: true, price: true, instructor: { select: { name: true } } },
    });
    if (!c) throw new NotFoundException("This course isn't available.");
    return c;
  }

  /** Discount for a coupon code, or the reason it can't be used. */
  private async applyCoupon(tenantId: string, courseId: string, code: string, price: number) {
    const coupon = await this.prisma.coupon.findFirst({ where: { institutionId: tenantId, code: code.trim().toUpperCase() } });
    const now = new Date();
    const error =
      !coupon || coupon.status !== "ACTIVE"
        ? "This coupon code isn't valid."
        : coupon.courseId !== courseId
          ? "This coupon can't be used for this course."
          : now < coupon.startDate
            ? "This coupon isn't active yet."
            : now > coupon.endDate
              ? "This coupon has expired."
              : coupon.usedCount >= coupon.maxUses
                ? "This coupon has been fully used."
                : null;
    if (error || !coupon) return { error, coupon: null, discount: 0 };
    const value = Number(coupon.discountTypeValue);
    const percent = coupon.discountType === "PERCENTAGE";
    const discount = round2(Math.min(price, percent ? (price * value) / 100 : value));
    return { error: null, coupon: { id: coupon.id, code: coupon.code, label: percent ? `${value}% off` : "Discount applied" }, discount };
  }

  private async enrolled(userId: string, courseId: string) {
    return !!(await this.prisma.enrollment.findFirst({ where: { userId, courseId, status: "ACTIVE" }, select: { id: true } }));
  }

  private async build(slug: string, userId: string, courseSlug: string, code?: string) {
    const inst = await this.learners.academy(slug);
    await this.learners.me(slug, userId);
    const c = await this.course(inst.id, courseSlug);
    const price = c.isFree ? 0 : round2(Number(c.price));
    const applied = code && price > 0 ? await this.applyCoupon(inst.id, c.id, code, price) : { error: null, coupon: null, discount: 0 };
    const quote: CheckoutQuote = {
      course: { id: c.id, slug: c.slug, title: c.title, thumbnail: c.thumbnail, instructor: c.instructor.name, level: c.level, isFree: price === 0 },
      currency: (await this.settings.section(inst.id, "general")).currency,
      price,
      discount: applied.discount,
      total: round2(price - applied.discount),
      coupon: applied.coupon ? { code: applied.coupon.code, label: applied.coupon.label } : null,
      couponError: applied.error,
      enrolled: await this.enrolled(userId, c.id),
    };
    return { inst, couponId: applied.coupon?.id ?? null, quote };
  }

  quote(slug: string, userId: string, courseSlug: string, code?: string) {
    return this.build(slug, userId, courseSlug, code).then((r) => r.quote);
  }

  async access(slug: string, userId: string, courseSlug: string) {
    const inst = await this.learners.academy(slug);
    const c = await this.course(inst.id, courseSlug);
    return { enrolled: await this.enrolled(userId, c.id) };
  }

  async start(slug: string, userId: string, courseSlug: string, code: string | undefined, meta: { ip?: string; device?: string }): Promise<CheckoutStart> {
    const { inst, couponId, quote } = await this.build(slug, userId, courseSlug, code);
    if (quote.enrolled) throw new ConflictException("You're already enrolled in this course.");
    if (code && quote.couponError) throw new BadRequestException(quote.couponError);

    // Free course: enrol straight away, no order.
    if (quote.price === 0) {
      await this.prisma.$transaction(async (tx) => {
        const created = await tx.enrollment.createMany({ data: [{ userId, courseId: quote.course.id, status: "ACTIVE" }], skipDuplicates: true });
        if (created.count) await tx.course.update({ where: { id: quote.course.id }, data: { totalStudents: { increment: 1 } } });
      });
      return { status: "ENROLLED", orderId: null };
    }

    const order = await this.prisma.$transaction(async (tx) => {
      const o = await tx.order.create({
        data: {
          orderNumber: `ACD-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`,
          userId,
          courseId: quote.course.id,
          amount: new Prisma.Decimal(quote.price),
          discountAmount: new Prisma.Decimal(quote.discount),
          taxAmount: new Prisma.Decimal(0),
          totalAmount: new Prisma.Decimal(quote.total),
          currency: quote.currency,
          status: "PENDING",
          couponId,
          ipAddress: meta.ip ?? null,
          device: meta.device?.slice(0, 200) ?? null,
          referralSource: "Academy website",
        },
      });
      await this.lifecycle.placed(tx, o.id, "Student");
      return o;
    });

    // A coupon that covers the whole price: paid without the gateway.
    if (quote.total <= 0) {
      await this.prisma.$transaction(async (tx) => {
        await this.lifecycle.markPaid(tx, order, { kind: "VERIFIED", method: "Coupon", transactionId: order.orderNumber, paidAt: new Date(), actorName: "System", note: `Coupon ${quote.coupon?.code}` });
        await this.countCoupon(tx, order);
      });
      return { status: "ENROLLED", orderId: order.id };
    }

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, email: true, phone: true } });
    const cb = `${API_PUBLIC_URL()}/academy/checkout/sslcommerz`;
    const form = new URLSearchParams({
      store_id: process.env.SSL_STORE_ID ?? "",
      store_passwd: process.env.SSL_STORE_PASSWORD ?? "",
      total_amount: quote.total.toFixed(2),
      currency: quote.currency,
      tran_id: order.orderNumber,
      success_url: `${cb}/success`,
      fail_url: `${cb}/fail`,
      cancel_url: `${cb}/cancel`,
      ipn_url: `${cb}/ipn`,
      cus_name: user.name,
      cus_email: user.email,
      cus_phone: user.phone || "N/A",
      cus_add1: "N/A",
      cus_city: "N/A",
      cus_country: "Bangladesh",
      shipping_method: "NO",
      num_of_item: "1",
      product_name: quote.course.title.slice(0, 250),
      product_category: "Online course",
      product_profile: "non-physical-goods",
      value_a: order.id,
      value_b: inst.id,
    });
    try {
      const { data } = await axios.post(`${gatewayBase()}/gwprocess/v4/api.php`, form.toString(), { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 20_000 });
      if (data?.status !== "SUCCESS" || !data?.GatewayPageURL) throw new Error(String(data?.failedreason || data?.status || "no gateway URL"));
      return { status: "REDIRECT", gatewayUrl: String(data.GatewayPageURL), orderId: order.id };
    } catch (err: any) {
      this.logger.error(`SSLCommerz session failed for ${order.orderNumber}: ${err?.message ?? err}`);
      await this.lifecycle.gatewayClosed(order.id, "FAILED", "The payment page couldn't be opened").catch(() => null);
      throw new BadGatewayException("We couldn't open the payment page. Please try again in a moment.");
    }
  }

  /** Counts a coupon once its order is paid (idempotent per order). */
  private async countCoupon(tx: Prisma.TransactionClient, order: { id: string; userId: string; couponId: string | null; discountAmount: Prisma.Decimal }) {
    if (!order.couponId) return;
    if (await tx.couponUsage.findFirst({ where: { orderId: order.id }, select: { id: true } })) return;
    await tx.coupon.update({ where: { id: order.couponId }, data: { usedCount: { increment: 1 } } });
    await tx.couponUsage.create({ data: { couponId: order.couponId, userId: order.userId, orderId: order.id, discountAmount: order.discountAmount } });
  }

  // ---------------------------------------------------------------- gateway callbacks

  private async orderByTran(tranId: string) {
    return this.prisma.order.findUnique({ where: { orderNumber: tranId } });
  }

  /** Success redirect / IPN: validate val_id with SSLCommerz, then mark paid. Safe to call repeatedly. */
  async confirm(tranId: string, valId: string) {
    const order = await this.orderByTran(tranId);
    if (!order || statusLabel(order.status) === "Paid") return order;
    const tx = valId ? await this.ssl.validate(valId).catch(() => null) : null;
    const expected = round2(Number(order.totalAmount));
    if (!tx || tx.tranId !== order.orderNumber || Math.abs(tx.amount - expected) > 0.01 || (tx.currency && tx.currency !== order.currency)) {
      this.logger.warn(`Rejected unverifiable academy payment for ${order.orderNumber} (val_id ${valId || "missing"})`);
      return order;
    }
    const paid = await this.prisma.$transaction(async (t) => {
      const fresh = await t.order.findUniqueOrThrow({ where: { id: order.id } });
      const done = await this.lifecycle.markPaid(t, fresh, {
        kind: "GATEWAY",
        method: "SSLCommerz",
        account: SslCommerzService.maskedAccount(tx),
        transactionId: tx.bankTranId || tx.valId,
        paidAt: new Date(),
        actorName: "System",
        gatewayResponse: tx.raw,
      });
      if (done) await this.countCoupon(t, fresh);
      return done;
    });
    if (paid) await this.invoices.generateInvoice(order.id).catch((e: any) => this.logger.error(`Invoice for ${order.orderNumber} failed: ${e?.message ?? e}`));
    return order;
  }

  async close(tranId: string, outcome: "FAILED" | "CANCELLED") {
    const order = await this.orderByTran(tranId);
    if (order) await this.lifecycle.gatewayClosed(order.id, outcome, outcome === "FAILED" ? "Declined at the payment gateway" : "Cancelled by the learner at the payment gateway");
    return order;
  }

  /** Where the gateway sends the browser back: the academy's own site. */
  async returnUrl(tranId: string) {
    const order = tranId ? await this.prisma.order.findUnique({ where: { orderNumber: tranId }, select: { id: true, course: { select: { institutionId: true } } } }) : null;
    const tenantId = order?.course.institutionId;
    const inst = tenantId ? await this.prisma.institution.findUnique({ where: { id: tenantId }, select: { slug: true, customDomain: { select: { domain: true, status: true } } } }) : null;
    let origin: string;
    if (inst?.customDomain?.status === "VERIFIED") origin = `https://${inst.customDomain.domain}`;
    else if (process.env.NODE_ENV !== "production") origin = (process.env.ACADEMY_SITE_DEV_URL || "http://localhost:3003").replace(/\/$/, "");
    else origin = `https://${inst?.slug ?? "www"}.${process.env.SAAS_ROOT_DOMAIN || SAAS_ROOT_DOMAIN}`;
    return order ? `${origin}/checkout/result?order=${order.id}` : `${origin}/courses`;
  }

  // ---------------------------------------------------------------- my courses

  /** The learner's active enrollments in this academy, newest first, with progress. */
  async myCourses(slug: string, userId: string) {
    const inst = await this.learners.academy(slug);
    const rows = await this.prisma.enrollment.findMany({
      where: { userId, status: "ACTIVE", course: { institutionId: inst.id } },
      orderBy: [{ lastAccessedAt: { sort: "desc", nulls: "last" } }, { enrolledAt: "desc" }],
      select: {
        enrolledAt: true,
        progressPercentage: true,
        completedAt: true,
        lastAccessedAt: true,
        course: { select: { id: true, slug: true, title: true, thumbnail: true, level: true, status: true, instructor: { select: { name: true, avatar: true } } } },
      },
    });
    const ids = rows.map((r) => r.course.id);
    const counts = ids.length ? await this.prisma.lesson.groupBy({ by: ["courseId"], where: { courseId: { in: ids }, status: "PUBLISHED" }, _count: { _all: true } }) : [];
    return rows.map((r) => ({
      course: { slug: r.course.slug, title: r.course.title, thumbnail: r.course.thumbnail, level: r.course.level, available: r.course.status === "PUBLISHED", instructor: r.course.instructor },
      lessons: counts.find((c) => c.courseId === r.course.id)?._count._all ?? 0,
      progress: r.progressPercentage,
      completedAt: r.completedAt,
      enrolledAt: r.enrolledAt,
      lastAccessedAt: r.lastAccessedAt,
    }));
  }

  // ---------------------------------------------------------------- result

  async result(slug: string, userId: string, orderId: string): Promise<CheckoutResult> {
    const inst = await this.learners.academy(slug);
    const o = await this.prisma.order.findFirst({
      where: { id: orderId, userId, course: { institutionId: inst.id } },
      select: { id: true, orderNumber: true, status: true, totalAmount: true, currency: true, paidAt: true, paymentMethod: true, course: { select: { slug: true, title: true, thumbnail: true } } },
    });
    if (!o) throw new NotFoundException("Order not found");
    const label = statusLabel(o.status);
    const status = label === "Paid" ? "PAID" : label === "Failed" ? "FAILED" : label === "Cancelled" ? "CANCELLED" : label === "Refunded" ? "REFUNDED" : "PENDING";
    return { orderId: o.id, orderNumber: o.orderNumber, status, total: Number(o.totalAmount), currency: o.currency, paidAt: o.paidAt, method: o.paymentMethod, course: o.course };
  }
}
