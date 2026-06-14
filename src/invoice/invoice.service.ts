import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
const PDFDocument = require('pdfkit');
import { CloudinaryService } from "../cloudinary/cloudinary.service"; // আপনার সার্ভিসটি ইমপোর্ট করুন

@Injectable()
export class InvoiceService {
  constructor(
    private prisma: PrismaService,
    private cloudinary: CloudinaryService, // আপনার কনফিগার করা সার্ভিস
  ) {}

  async generateInvoice(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { course: true },
    });

    if (!order) throw new NotFoundException("Order not found");

    // ১. পিডিএফ মেমরিতে তৈরি করুন
    const pdfBuffer: Buffer = await new Promise((resolve) => {
      const doc = new PDFDocument({ margin: 50 });
      const buffers: any[] = [];
      doc.on("data", buffers.push.bind(buffers));
      doc.on("end", () => resolve(Buffer.concat(buffers)));

      doc.fontSize(20).text("INVOICE", { align: "center" });
      doc.moveDown();
      doc.fontSize(12).text(`Order ID: ${order.orderNumber}`);
      doc.text(`Course: ${order.course.title}`);
      doc.text(`Total Amount: ${order.totalAmount.toString()} BDT`);
      doc.end();
    });

    // ২. ক্লাউডিনারিতে পিডিএফ আপলোড করুন
    // যেহেতু এটি একটি বাফার, আপনি আপনার CloudinaryService-এ একটি মেথড রাখুন
    const invoiceUrl = await this.cloudinary.uploadBuffer(
      pdfBuffer,
      "invoices",
    );

    // ৩. ডাটাবেসে সেভ করুন
    return await this.prisma.invoice.create({
      data: {
        invoiceNumber: `INV-${Date.now()}`,
        orderId,
        userId: order.userId,
        courseId: order.courseId,
        amount: order.amount,
        discountAmount: order.discountAmount,
        taxAmount: order.taxAmount,
        totalAmount: order.totalAmount,
        currency: order.currency,
        invoiceUrl: invoiceUrl,
      },
    });
  }
}
