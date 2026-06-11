import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import axios from "axios";

@Injectable()
export class PaymentService {
  constructor(private prisma: PrismaService) {}

  async initiatePayment(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { course: true },
    });

    if (!order) throw new NotFoundException("Order not found");

    const payload = {
      store_id: process.env.SSL_STORE_ID,
      store_passwd: process.env.SSL_STORE_PASSWORD,
      total_amount: order.totalAmount,
      currency: "BDT",
      tran_id: order.orderNumber,
      success_url: `${process.env.BACKEND_URL}/payments/success/${order.id}`,
      fail_url: `${process.env.BACKEND_URL}/payments/fail`,
      cancel_url: `${process.env.BACKEND_URL}/payments/cancel`,
      cus_name: "Student",
      cus_email: "student@example.com",
      product_name: order.course.title,
      product_category: "Education",
    };

    const response = await axios.post(
      "https://sandbox.sslcommerz.com/gwprocess/v3/api.php",
      payload,
    );
    return { gatewayUrl: response.data.GatewayPageURL };
  }

  async recordPayment(
    orderId: string,
    transactionId: string,
    gatewayData: any,
  ) {
    return await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order) throw new NotFoundException("Order not found");

      const payment = await tx.payment.create({
        data: {
          orderId,
          userId: order.userId,
          courseId: order.courseId,
          paymentMethodId: "SSLCOMMERZ",
          provider: "SSLCOMMERZ",
          providerTransactionId: transactionId,
          amount: order.totalAmount,
          currency: order.currency,
          status: "SUCCESS",
          gatewayResponse: JSON.stringify(gatewayData),
          paidAt: new Date(),
        },
      });

      await tx.order.update({
        where: { id: orderId },
        data: { status: "PAID" },
      });

      await tx.enrollment.create({
        data: {
          userId: order.userId,
          courseId: order.courseId,
          status: "ACTIVE",
        },
      });

      return payment;
    });
  }
}
