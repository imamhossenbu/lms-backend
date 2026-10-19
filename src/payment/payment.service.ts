import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import axios from "axios";
import * as qs from "qs";
import { EnrollmentService } from "../enrollment/enrollment.service";
import { InvoiceService } from "../invoice/invoice.service";

@Injectable()
export class PaymentService {
  constructor(
    private prisma: PrismaService,
    private enrollmentService: EnrollmentService,
    private invoiceService: InvoiceService,
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
        "https://sandbox.sslcommerz.com/gwprocess/v4/api.php",
        qs.stringify(payload),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        },
      );

      console.log(response);

      console.log("SSL RESPONSE:", response.data);

      return {
        gatewayUrl: response.data.GatewayPageURL,
        data: response.data,
      };
    } catch (error: any) {
      console.log("SSL ERROR:", error.response?.data || error.message);

      throw error;
    }
  }


  // Record payment details and enroll the user in the course
  async recordPayment(
    orderId: string,
    transactionId: string,
    gatewayData: any,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException("Order not found");
    }

    if (order.status === "PAID") {
      return {
        message: "Payment already completed",
      };
    }

    const payment = await this.prisma.payment.create({
      data: {
        orderId,
        userId: order.userId,
        courseId: order.courseId,

        provider: "SSLCOMMERZ",
        providerTransactionId: transactionId,

        amount: order.totalAmount,
        currency: order.currency,

        status: "SUCCESS",

        gatewayResponse: JSON.stringify(gatewayData),

        paidAt: new Date(),
      },
    });

    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: "PAID",
      },
    });

    await this.enrollmentService.enrollUser(order.userId, order.courseId);

    try {
      await this.invoiceService.generateInvoice(orderId);
      console.log("Invoice generated successfully for order:", orderId);
    } catch (error) {
      console.error("Failed to generate invoice:", error);
    }
    return payment;
  }

  // Handle failed payment callback
  async handleFailedPayment(orderId: string, gatewayData: any) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException("Order not found");
    }

    await this.prisma.order.update({
      where: { id: orderId },
      data: { status: "FAILED" },
    });

    return {
      status: "FAILED",
      message: "Payment failed or was declined.",
      orderId,
      gatewayData,
    };
  }

  // Handle cancelled payment callback
  async handleCancelledPayment(orderId: string, gatewayData: any) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException("Order not found");
    }

    await this.prisma.order.update({
      where: { id: orderId },
      data: { status: "CANCELLED" },
    });

    return {
      status: "CANCELLED",
      message: "Payment was cancelled by user.",
      orderId,
      gatewayData,
    };
  }
}

