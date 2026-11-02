import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import axios from "axios";
import * as qs from "qs";
import { OrderLifecycleService } from "../commerce/order-lifecycle.service";
import { round2, statusLabel } from "../commerce/order-status";
import { SslCommerzService } from "../commerce/sslcommerz.service";
import { InvoiceService } from "../invoice/invoice.service";

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private prisma: PrismaService,
    private invoiceService: InvoiceService,
    private lifecycle: OrderLifecycleService,
    private sslcommerz: SslCommerzService,
  ) {}


  // Initiate payment and get the SSLCommerz gateway URL
  async initiatePayment(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { course: true },
    });

    if (!order) {
      throw new NotFoundException("Order not found");
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    const payload = {
      store_id: process.env.SSL_STORE_ID,
      store_passwd: process.env.SSL_STORE_PASSWORD,

      total_amount: order.totalAmount.toString(),
      currency: "BDT",
      tran_id: order.orderNumber,

      success_url: `${process.env.BACKEND_URL}/payments/success/${order.id}`,
      fail_url: `${process.env.BACKEND_URL}/payments/fail/${order.id}`,
      cancel_url: `${process.env.BACKEND_URL}/payments/cancel/${order.id}`,

      cus_name: user?.name || "Student",
      cus_email: user?.email || "student@example.com",
      cus_add1: user?.address || "Dhaka",
      cus_city: user?.country || "Dhaka",
      cus_country: "Bangladesh",
      cus_phone: user?.phone || "01700000000",

      shipping_method: "NO",

      product_name: order.course.title,
      product_category: "Education",
      product_profile: "general",
    };

    try {
      const response = await axios.post(
        `${process.env.SSL_IS_LIVE === "true" ? "https://securepay.sslcommerz.com" : "https://sandbox.sslcommerz.com"}/gwprocess/v4/api.php`,
        qs.stringify(payload),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        },
      );

      return {
        gatewayUrl: response.data.GatewayPageURL,
        data: response.data,
      };
    } catch (error: any) {
      this.logger.error(`SSLCommerz session failed for order ${order.orderNumber}: ${error.response?.data?.failedreason ?? error.message}`);

      throw error;
    }
  }


  /**
   * SSLCommerz success redirect. The browser-posted body is NOT trusted: the val_id is validated with
   * SSLCommerz's server API and must match this order's reference, amount and currency before the
   * order is marked paid (which also enrolls the student). Idempotent for repeated callbacks.
   */
  async recordPayment(orderId: string, valId: string, _gatewayData: unknown) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException("Order not found");
    if (statusLabel(order.status) === "Paid") return { status: "PAID", message: "Payment already completed", orderId };

    const tx = await this.sslcommerz.validate(valId);
    const expected = round2(Number(order.totalAmount));
    if (!tx || tx.tranId !== order.orderNumber || Math.abs(tx.amount - expected) > 0.01 || (tx.currency && tx.currency !== order.currency)) {
      this.logger.warn(`Rejected unverifiable payment for order ${order.orderNumber} (val_id ${valId || "missing"})`);
      throw new BadRequestException("We couldn't verify this payment with the gateway. If you were charged, contact support with your order number.");
    }

    await this.prisma.$transaction((t) =>
      this.lifecycle.markPaid(t, order, {
        kind: "GATEWAY",
        method: "SSLCommerz",
        account: SslCommerzService.maskedAccount(tx),
        transactionId: tx.bankTranId || tx.valId,
        paidAt: new Date(),
        actorName: "System",
        gatewayResponse: tx.raw,
      }),
    );

    try {
      await this.invoiceService.generateInvoice(orderId);
    } catch (error: any) {
      this.logger.error(`Invoice generation failed for order ${order.orderNumber}: ${error?.message ?? error}`);
    }
    return { status: "PAID", message: "Payment completed", orderId };
  }

  /** SSLCommerz fail redirect — only a still-pending order is marked failed. */
  async handleFailedPayment(orderId: string, _gatewayData: unknown) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: { id: true } });
    if (!order) throw new NotFoundException("Order not found");
    await this.lifecycle.gatewayClosed(orderId, "FAILED", "Declined at the payment gateway");
    return { status: "FAILED", message: "Payment failed or was declined.", orderId };
  }

  /** SSLCommerz cancel redirect — only a still-pending order is cancelled. */
  async handleCancelledPayment(orderId: string, _gatewayData: unknown) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: { id: true } });
    if (!order) throw new NotFoundException("Order not found");
    await this.lifecycle.gatewayClosed(orderId, "CANCELLED", "Cancelled by the student at the payment gateway");
    return { status: "CANCELLED", message: "Payment was cancelled by user.", orderId };
  }
}
