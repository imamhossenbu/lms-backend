import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CloudinaryService } from "../cloudinary/cloudinary.service";
const PDFDocument = require("pdfkit");
const bwipjs = require("bwip-js"); // npm install bwip-js

// ── palette ─────────────────────────────────────────────────────────────────
const C = {
  dark: "#18181b",
  mid: "#52525b",
  light: "#a1a1aa",
  border: "#e4e4e7",
  accent: "#534AB7",
  accentLt: "#AFA9EC",
  bg: "#fafafa",
  white: "#ffffff",
  green: "#16a34a",
  greenBg: "#f0fdf4",
  greenBr: "#86efac",
  amber: "#92400e",
  amberBg: "#fffbeb",
  amberBr: "#fde68a",
  pageBg: "#f4f4f7",
};

@Injectable()
export class InvoiceService {
  constructor(
    private prisma: PrismaService,
    private cloudinary: CloudinaryService,
  ) {}

  // ── main entry

  // ── get all invoices for a user
  async getMyInvoices(userId: string) {
    return await this.prisma.invoice.findMany({
      where: { userId },
      orderBy: { issuedAt: "desc" },
    });
  }

  // ── get single invoice by id
  async findOne(id: string) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw new NotFoundException("Invoice not found");
    return invoice;
  }
  async generateInvoice(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { course: true },
    });

    if (!order) throw new NotFoundException("Order not found");

    const user = await this.prisma.user.findUnique({
      where: { id: order.userId },
    });

    const invoiceNumber = `INV-${Date.now()}`;
    const pdfBuffer = await this.buildPDF(order, user, invoiceNumber);

    const invoiceUrl = await this.cloudinary.uploadBuffer(
      pdfBuffer,
      "invoices",
    );

    return await this.prisma.invoice.create({
      data: {
        invoiceNumber,
        orderId,
        userId: order.userId,
        courseId: order.courseId,
        amount: order.amount,
        discountAmount: order.discountAmount,
        taxAmount: order.taxAmount,
        totalAmount: order.totalAmount,
        currency: order.currency,
        invoiceUrl,
      },
    });
  }

  // ── PDF builder ─────────────────────────────────────────────────────────
  private async buildPDF(
    order: any,
    user: any,
    invoiceNumber: string,
  ): Promise<Buffer> {
    const PAGE_W = 595.28;
    const PAGE_H = 841.89;
    const MARGIN = 40;
    const RIGHT = PAGE_W - MARGIN;

    // generate barcode PNG buffer
    const barcodeBuffer: Buffer = await bwipjs.toBuffer({
      bcid: "code128",
      text: invoiceNumber.replace(/-/g, ""),
      scale: 2,
      height: 12,
      includetext: true,
      textxalign: "center",
      textsize: 8,
      backgroundcolor: "ffffff",
      barcolor: "18181b",
    });

    return new Promise((resolve) => {
      const doc = new PDFDocument({ size: "A4", margin: 0, compress: true });
      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));

      const W = PAGE_W;
      const H = PAGE_H;

      // ── background ──────────────────────────────
      doc.rect(0, 0, W, H).fill(C.white);

      // ── top accent bar ───────────────────────────
      doc.rect(0, 0, W, 6).fill(C.accent);

      // ── header bg ───────────────────────────────
      doc.rect(0, 6, W, 124).fill(C.bg);
      doc
        .moveTo(0, 130)
        .lineTo(W, 130)
        .lineWidth(0.5)
        .strokeColor(C.border)
        .stroke();

      // logo pill
      doc.roundedRect(MARGIN, 20, 118, 28, 6).fill(C.accent);
      doc
        .font("Helvetica-Bold")
        .fontSize(10)
        .fillColor(C.white)
        .text("LMS PLATFORM", MARGIN + 12, 30, { lineBreak: false });

      // INVOICE title
      doc
        .font("Helvetica-Bold")
        .fontSize(26)
        .fillColor(C.dark)
        .text("INVOICE", 0, 24, {
          align: "right",
          width: RIGHT,
          lineBreak: false,
        });

      // PAID badge
      doc
        .roundedRect(MARGIN, 58, 58, 20, 5)
        .fillAndStroke(C.greenBg, C.greenBr);
      doc
        .font("Helvetica-Bold")
        .fontSize(8.5)
        .fillColor(C.green)
        .text("✓  PAID", MARGIN + 9, 64, { lineBreak: false });

      // meta (right)
      const today = new Date().toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
      const meta = [
        ["Invoice No", invoiceNumber],
        ["Order Ref", order.orderNumber ?? "ORD-000001"],
        ["Date", today],
        ["Due Date", "On receipt"],
      ];
      let metaY = 20;
      for (const [label, value] of meta) {
        doc
          .font("Helvetica")
          .fontSize(7.5)
          .fillColor(C.light)
          .text(label.toUpperCase(), 0, metaY, {
            align: "right",
            width: RIGHT,
            lineBreak: false,
          });
        doc
          .font("Helvetica-Bold")
          .fontSize(8.5)
          .fillColor(C.dark)
          .text(value, 0, metaY + 11, {
            align: "right",
            width: RIGHT,
            lineBreak: false,
          });
        metaY += 28;
      }

      // ── from / to / payment columns ─────────────
      const colY = 150;

      // accent underlines for section labels
      const drawSectionLabel = (
        label: string,
        x: number,
        y: number,
        w: number,
      ) => {
        doc
          .font("Helvetica-Bold")
          .fontSize(7.5)
          .fillColor(C.light)
          .text(label, x, y, { lineBreak: false });
        doc
          .moveTo(x, y + 12)
          .lineTo(x + w, y + 12)
          .lineWidth(1)
          .strokeColor(C.accent)
          .stroke();
      };

      drawSectionLabel("FROM", MARGIN, colY, 44);
      doc
        .font("Helvetica-Bold")
        .fontSize(11)
        .fillColor(C.dark)
        .text("LMS Platform", MARGIN, colY + 18, { lineBreak: false });
      const fromLines = [
        "support@lmsplatform.com",
        "www.lmsplatform.com",
        "Dhaka, Bangladesh",
      ];
      fromLines.forEach((l, i) => {
        doc
          .font("Helvetica")
          .fontSize(8.5)
          .fillColor(C.mid)
          .text(l, MARGIN, colY + 33 + i * 14, { lineBreak: false });
      });

      drawSectionLabel("BILLED TO", 220, colY, 68);
      const userName = user?.name ?? "Student";
      const userEmail = user?.email ?? "student@example.com";
      doc
        .font("Helvetica-Bold")
        .fontSize(11)
        .fillColor(C.dark)
        .text(userName, 220, colY + 18, { lineBreak: false });
      [
        userEmail,
        `Student ID: STU-${order.userId?.slice(-5)}`,
        "Dhaka, Bangladesh",
      ].forEach((l, i) => {
        doc
          .font("Helvetica")
          .fontSize(8.5)
          .fillColor(C.mid)
          .text(l, 220, colY + 33 + i * 14, { lineBreak: false });
      });

      drawSectionLabel("PAYMENT METHOD", 400, colY, 110);
      doc
        .font("Helvetica-Bold")
        .fontSize(11)
        .fillColor(C.dark)
        .text("SSLCommerz", 400, colY + 18, { lineBreak: false });
      [
        `Txn: ${order.transactionId ?? "TXN-XXXXXXX"}`,
        "Status: Approved",
        order.currency ?? "BDT",
      ].forEach((l, i) => {
        doc
          .font("Helvetica")
          .fontSize(8.5)
          .fillColor(C.mid)
          .text(l, 400, colY + 33 + i * 14, { lineBreak: false });
      });

      // ── divider ──────────────────────────────────
      doc
        .moveTo(MARGIN, 260)
        .lineTo(RIGHT, 260)
        .lineWidth(0.5)
        .strokeColor(C.border)
        .stroke();

      // ── table header ─────────────────────────────
      const tableY = 274;
      doc.roundedRect(MARGIN, tableY, RIGHT - MARGIN, 22, 4).fill(C.pageBg);

      const cols = {
        desc: 48,
        duration: 310,
        price: 390,
        disc: 450,
        total: RIGHT,
      };
      doc.font("Helvetica-Bold").fontSize(7.5).fillColor(C.mid);
      doc.text("DESCRIPTION", cols.desc, tableY + 7, { lineBreak: false });
      doc.text("DURATION", cols.duration, tableY + 7, { lineBreak: false });
      doc.text("PRICE", cols.price, tableY + 7, { lineBreak: false });
      doc.text("DISC.", cols.disc, tableY + 7, { lineBreak: false });
      doc.text("TOTAL", 0, tableY + 7, {
        align: "right",
        width: RIGHT,
        lineBreak: false,
      });

      // ── item row ─────────────────────────────────
      const rowY = tableY + 36;
      doc
        .font("Helvetica-Bold")
        .fontSize(10)
        .fillColor(C.dark)
        .text(order.course?.title ?? "Course", cols.desc, rowY, {
          lineBreak: false,
        });
      doc
        .font("Helvetica")
        .fontSize(8.5)
        .fillColor(C.mid)
        .text(
          "Lifetime Access · All Levels · Certificate Included",
          cols.desc,
          rowY + 14,
          { lineBreak: false },
        );

      const currency = order.currency === "BDT" ? "৳" : "$";
      doc.font("Helvetica").fontSize(10).fillColor(C.dark);
      doc.text("Online", cols.duration, rowY, { lineBreak: false });
      doc.text(`${currency} ${order.amount}`, cols.price, rowY, {
        lineBreak: false,
      });
      doc.text(`${currency} ${order.discountAmount}`, cols.disc, rowY, {
        lineBreak: false,
      });
      doc.text(`${currency} ${order.totalAmount}`, 0, rowY, {
        align: "right",
        width: RIGHT,
        lineBreak: false,
      });

      doc
        .moveTo(MARGIN, rowY + 30)
        .lineTo(RIGHT, rowY + 30)
        .lineWidth(0.3)
        .strokeColor(C.border)
        .stroke();

      // ── totals ───────────────────────────────────
      let totY = rowY + 52;
      const totals = [
        ["Subtotal", `${currency} ${order.amount}`],
        ["Discount", `- ${currency} ${order.discountAmount}`],
        [
          `Tax (${order.taxAmount > 0 ? "5" : "0"}%)`,
          `${currency} ${order.taxAmount}`,
        ],
      ];
      for (const [label, value] of totals) {
        doc
          .font("Helvetica")
          .fontSize(9)
          .fillColor(C.mid)
          .text(label, 0, totY, {
            align: "right",
            width: RIGHT - 90,
            lineBreak: false,
          });
        doc
          .font("Helvetica")
          .fontSize(9)
          .fillColor(C.dark)
          .text(value, 0, totY, {
            align: "right",
            width: RIGHT,
            lineBreak: false,
          });
        totY += 18;
      }

      doc
        .moveTo(RIGHT - 170, totY + 2)
        .lineTo(RIGHT, totY + 2)
        .lineWidth(0.5)
        .strokeColor(C.border)
        .stroke();

      // total pill
      totY += 10;
      doc.roundedRect(RIGHT - 180, totY, 180, 26, 5).fill(C.accent);
      doc
        .font("Helvetica-Bold")
        .fontSize(9.5)
        .fillColor(C.white)
        .text("TOTAL", RIGHT - 170, totY + 8, { lineBreak: false });
      doc
        .font("Helvetica-Bold")
        .fontSize(12)
        .fillColor(C.white)
        .text(`${currency} ${order.totalAmount}`, 0, totY + 7, {
          align: "right",
          width: RIGHT,
          lineBreak: false,
        });

      // ── barcode + note row ───────────────────────
      const bcY = totY + 56;

      // barcode box
      doc.roundedRect(MARGIN, bcY, 190, 62, 5).fillAndStroke(C.bg, C.border);
      doc.image(barcodeBuffer, MARGIN + 5, bcY + 5, { width: 180, height: 48 });
      doc
        .font("Helvetica")
        .fontSize(7)
        .fillColor(C.light)
        .text("Scan to verify invoice authenticity", MARGIN, bcY + 55, {
          lineBreak: false,
        });

      // note box
      doc
        .roundedRect(250, bcY, RIGHT - 250, 62, 5)
        .fillAndStroke(C.amberBg, C.amberBr);
      doc
        .font("Helvetica-Bold")
        .fontSize(8)
        .fillColor(C.amber)
        .text("Note", 262, bcY + 8, { lineBreak: false });
      const noteLines = [
        "This is an automatically generated invoice.",
        "For queries: support@lmsplatform.com",
        "Help: lmsplatform.com/help",
      ];
      noteLines.forEach((l, i) => {
        doc
          .font("Helvetica")
          .fontSize(8)
          .fillColor("#78350f")
          .text(l, 262, bcY + 22 + i * 13, { lineBreak: false });
      });

      // ── footer ───────────────────────────────────
      doc.rect(0, H - 38, W, 38).fill(C.accent);
      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor(C.white)
        .text(
          "LMS Platform  ·  support@lmsplatform.com  ·  www.lmsplatform.com  ·  Dhaka, Bangladesh",
          0,
          H - 26,
          { align: "center", width: W, lineBreak: false },
        );
      doc
        .font("Helvetica")
        .fontSize(7)
        .fillColor(C.accentLt)
        .text("Thank you for learning with us!", 0, H - 14, {
          align: "center",
          width: W,
          lineBreak: false,
        });

      doc.end();
    });
  }
}
