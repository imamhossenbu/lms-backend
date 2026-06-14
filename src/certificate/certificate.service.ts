import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CloudinaryService } from "../cloudinary/cloudinary.service";
import { MailService } from "../auth/mail/mail.service";
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");

// ── palette ──────────────────────────────────────────────────────────────────
const C = {
  navy: "#1B3A6B",
  gold: "#C8981E",
  gold2: "#D4AF37",
  teal: "#2BA8C8",
  tealLt: "#6EC6DC",
  dark: "#1a1a2e",
  mid: "#444466",
  white: "#ffffff",
  borderOut: "#C8981E",
  borderIn: "#A8D8E8",
  gray: "#aaaaaa",
};

@Injectable()
export class CertificateService {
  constructor(
    private prisma: PrismaService,
    private cloudinary: CloudinaryService,
    private mailService: MailService,
  ) {}

  // ── get user certificates ────────────────────────────────────────────────
  async getUserCertificates(userId: string) {
    return await this.prisma.certificate.findMany({
      where: { userId },
      include: { course: true },
    });
  }

  // ── verify certificate by code ───────────────────────────────────────────
  async verifyCertificate(code: string) {
    const cert = await this.prisma.certificate.findUnique({
      where: { verificationCode: code },
      include: { user: true, course: true },
    });
    if (!cert) throw new NotFoundException("Invalid verification code");
    return cert;
  }

  // ── generate certificate ─────────────────────────────────────────────────
  async generateCertificate(userId: string, courseId: string) {
    const certNumber = `CERT-${Date.now()}`;
    const verCode = Math.random().toString(36).substring(2, 10).toUpperCase();

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });

    if (!user) throw new NotFoundException("User not found");
    if (!course) throw new NotFoundException("Course not found");

    const verifyUrl = `https://lmsplatform.com/certificate/verify/${verCode}`;
    const pdfBuffer = await this.buildPDF({
      user,
      course,
      certNumber,
      verCode,
      verifyUrl,
    });
    const certUrl = await this.cloudinary.uploadBuffer(
      pdfBuffer,
      "certificates",
    );

    const newCert = await this.prisma.certificate.create({
      data: {
        userId,
        courseId,
        certificateNumber: certNumber,
        certificateUrl: certUrl,
        verificationCode: verCode,
      },
    });

    await this.mailService.sendCertificateEmail(
      user.email,
      user.name,
      course.title,
      certUrl,
      certNumber,
    );

    return newCert;
  }

  // ── PDF builder ──────────────────────────────────────────────────────────
  private async buildPDF(data: {
    user: any;
    course: any;
    certNumber: string;
    verCode: string;
    verifyUrl: string;
  }): Promise<Buffer> {
    const { user, course, certNumber, verifyUrl } = data;

    // landscape A4
    const W = 841.89;
    const H = 595.28;

    // QR code buffer
    const qrBuffer: Buffer = await QRCode.toBuffer(verifyUrl, {
      errorCorrectionLevel: "H",
      width: 200,
      margin: 2,
      color: { dark: C.dark, light: C.white },
    });

    const today = new Date();
    const validTil = new Date(today);
    validTil.setFullYear(validTil.getFullYear() + 1);
    const fmt = (d: Date) =>
      d
        .toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
        .replace(/ /g, "-");

    return new Promise((resolve) => {
      const doc = new PDFDocument({ size: [W, H], margin: 0, compress: true });
      const chunks: Buffer[] = [];
      doc.on("data", (ch: Buffer) => chunks.push(ch));
      doc.on("end", () => resolve(Buffer.concat(chunks)));

      // ── white background ─────────────────────────────────────────────────
      doc.rect(0, 0, W, H).fill(C.white);

      // ── outer gold border ────────────────────────────────────────────────
      doc
        .rect(12, 12, W - 24, H - 24)
        .lineWidth(2.5)
        .strokeColor(C.borderOut)
        .stroke();

      // ── inner teal border ────────────────────────────────────────────────
      doc
        .rect(18, 18, W - 36, H - 36)
        .lineWidth(1.5)
        .strokeColor(C.borderIn)
        .stroke();

      // ── MEDAL (top right) ────────────────────────────────────────────────
      const mx = W - 110,
        my = H - 108;

      // starburst (16-point gear)
      const starPath = (
        cx: number,
        cy: number,
        ro: number,
        ri: number,
        pts: number,
      ) => {
        const p = doc.path ? null : null; // pdfkit uses moveTo/lineTo
        let first = true;
        for (let i = 0; i < pts * 2; i++) {
          const angle = (Math.PI / pts) * i - Math.PI / 2;
          const r = i % 2 === 0 ? ro : ri;
          const x = cx + r * Math.cos(angle);
          const y = cy + r * Math.sin(angle);
          if (first) {
            doc.moveTo(x, y);
            first = false;
          } else doc.lineTo(x, y);
        }
        doc.closePath();
      };

      doc.save();
      starPath(mx, my, 72, 60, 16);
      doc.fill(C.gold);
      doc.restore();

      // white + teal inner circles
      doc.circle(mx, my, 50).fill(C.white);
      doc.circle(mx, my, 46).fill(C.teal);

      // trophy (white shapes on teal)
      // cup body
      doc.roundedRect(mx - 16, my - 6, 32, 24, 3).fill(C.white);
      // handles
      doc.save();
      doc.rect(mx - 28, my - 6, 12, 18).fill(C.white);
      doc.circle(mx - 22, my + 6, 6).fill(C.teal); // cutout left
      doc.rect(mx + 16, my - 6, 12, 18).fill(C.white);
      doc.circle(mx + 22, my + 6, 6).fill(C.teal); // cutout right
      doc.restore();
      // stem + base
      doc.rect(mx - 4, my - 18, 8, 14).fill(C.white);
      doc.roundedRect(mx - 12, my - 22, 24, 6, 2).fill(C.white);

      // ribbon below medal
      const ry = my - 50;
      // left (navy)
      doc
        .moveTo(mx - 20, ry)
        .lineTo(mx - 6, ry)
        .lineTo(mx - 6, ry - 58)
        .lineTo(mx - 20, ry - 46)
        .closePath()
        .fill(C.navy);
      // right (teal)
      doc
        .moveTo(mx + 20, ry)
        .lineTo(mx + 6, ry)
        .lineTo(mx + 6, ry - 58)
        .lineTo(mx + 20, ry - 46)
        .closePath()
        .fill(C.teal);

      // ── LOGO (top left) ──────────────────────────────────────────────────
      doc.circle(56, H - 56, 18).fill(C.teal);
      doc
        .font("Helvetica-Bold")
        .fontSize(13)
        .fillColor(C.white)
        .text("L", 49, H - 63, { lineBreak: false });

      doc
        .font("Helvetica-Bold")
        .fontSize(16)
        .fillColor(C.navy)
        .text("LMS", 80, H - 62, { lineBreak: false });
      doc
        .font("Helvetica-Bold")
        .fontSize(16)
        .fillColor(C.teal)
        .text("PLATFORM", 114, H - 62, { lineBreak: false });

      // ── CERTIFICATE OF COMPLETION ────────────────────────────────────────
      const centerX = W / 2 - 48; // shift left to avoid medal
      doc
        .font("Helvetica-Bold")
        .fontSize(34)
        .fillColor(C.navy)
        .text("CERTIFICATE OF COMPLETION", 0, H - 152, {
          align: "center",
          width: W - 96,
          lineBreak: false,
        });

      // ── awarded to ───────────────────────────────────────────────────────
      doc
        .font("Helvetica-Oblique")
        .fontSize(14)
        .fillColor(C.mid)
        .text("awarded to", 0, H - 192, {
          align: "center",
          width: W - 96,
          lineBreak: false,
        });

      // ── student name ─────────────────────────────────────────────────────
      doc
        .font("Helvetica-Bold")
        .fontSize(32)
        .fillColor(C.gold)
        .text(user.name ?? "Student", 0, H - 234, {
          align: "center",
          width: W - 96,
          lineBreak: false,
        });

      // ── recognition line ─────────────────────────────────────────────────
      doc
        .font("Helvetica-Oblique")
        .fontSize(13)
        .fillColor(C.navy)
        .text(
          "In recognition of successful completion of the Programme",
          0,
          H - 272,
          { align: "center", width: W - 96, lineBreak: false },
        );

      // ── course name ──────────────────────────────────────────────────────
      doc
        .font("Helvetica-Bold")
        .fontSize(21)
        .fillColor(C.gold)
        .text(course.title ?? "Course", 0, H - 306, {
          align: "center",
          width: W - 96,
          lineBreak: false,
        });

      // ── divider ──────────────────────────────────────────────────────────
      doc
        .moveTo(36, H - 334)
        .lineTo(W - 36, H - 334)
        .lineWidth(0.8)
        .strokeColor(C.borderIn)
        .stroke();

      // ── BOTTOM SECTION ───────────────────────────────────────────────────
      const by = H - 400;

      // signature squiggle (left)
      const sx = 58,
        sy = by + 56;
      doc.save();
      doc
        .moveTo(sx, sy)
        .bezierCurveTo(sx + 10, sy + 14, sx + 22, sy - 10, sx + 34, sy + 10)
        .bezierCurveTo(sx + 40, sy + 18, sx + 52, sy - 6, sx + 62, sy + 8)
        .bezierCurveTo(sx + 70, sy + 16, sx + 80, sy, sx + 94, sy + 6)
        .lineWidth(1.2)
        .strokeColor(C.navy)
        .stroke();
      doc.restore();

      // sig line
      doc
        .moveTo(sx, by + 38)
        .lineTo(sx + 148, by + 38)
        .lineWidth(0.8)
        .strokeColor(C.dark)
        .stroke();

      doc
        .font("Helvetica-Bold")
        .fontSize(11)
        .fillColor(C.navy)
        .text("Platform Director", sx, by + 24, { lineBreak: false });
      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor(C.teal)
        .text("Head - LMS Platform", sx, by + 10, { lineBreak: false });

      // QR code (center)
      const qrSize = 82;
      const qrX = (W - 96) / 2 - qrSize / 2 + 10;
      doc.image(qrBuffer, qrX, by + 4, { width: qrSize, height: qrSize });

      // date info (right)
      const dateX = W - 260;
      doc
        .font("Helvetica")
        .fontSize(11)
        .fillColor(C.navy)
        .text(`Date of Issue:  ${fmt(today)}`, dateX, by + 54, {
          lineBreak: false,
        });
      doc
        .font("Helvetica")
        .fontSize(11)
        .fillColor(C.navy)
        .text(`Valid Till:       ${fmt(validTil)}`, dateX, by + 32, {
          lineBreak: false,
        });

      // ── cert number (bottom center) ───────────────────────────────────────
      doc
        .font("Helvetica")
        .fontSize(7.5)
        .fillColor(C.gray)
        .text(
          `Certificate No: ${certNumber}  ·  Verify at lmsplatform.com/certificate/verify`,
          0,
          20,
          { align: "center", width: W, lineBreak: false },
        );

      doc.end();
    });
  }
}
