import * as QRCode from "qrcode";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require("pdfkit");

/** Template accents (panel palette) → print colours. */
const ACCENT_HEX: Record<string, string> = {
  orange: "#EA580C",
  blue: "#2563EB",
  green: "#059669",
  purple: "#7C3AED",
  navy: "#1E3A8A",
};

export const DEFAULT_CERT_HEADING = "Certificate of Completion";
export const DEFAULT_CERT_BODY = "This is to certify that {student_name} has successfully completed {course_title} on {completion_date}.";

export interface CertificatePdfInput {
  academyName: string;
  heading: string;
  /** Template body with {placeholders}. */
  bodyText: string;
  studentName: string;
  courseTitle: string;
  instructorName: string;
  completedAt: Date;
  certificateNumber: string;
  grade: number | null;
  showGrade: boolean;
  showQr: boolean;
  verifyUrl: string;
  accent: string;
  orientation: "LANDSCAPE" | "PORTRAIT";
  signers: { name: string; title: string }[];
  /** Watermark for certificates that are no longer valid (e.g. "EXPIRED"). */
  stamp?: string | null;
}

const fmtDate = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Dhaka" });

export function fillPlaceholders(text: string, v: CertificatePdfInput) {
  return text
    .replaceAll("{student_name}", v.studentName)
    .replaceAll("{course_title}", v.courseTitle)
    .replaceAll("{completion_date}", fmtDate(v.completedAt))
    .replaceAll("{grade}", v.grade != null ? `${v.grade}%` : "—")
    .replaceAll("{instructor_name}", v.instructorName)
    .replaceAll("{certificate_id}", v.certificateNumber);
}

/** Renders one certificate as a single-page A4 PDF (vector text, QR to the public verify page). */
export async function renderCertificatePdf(v: CertificatePdfInput): Promise<Buffer> {
  const accent = ACCENT_HEX[v.accent] ?? ACCENT_HEX.orange;
  const landscape = v.orientation !== "PORTRAIT";
  const qr = v.showQr ? await QRCode.toBuffer(v.verifyUrl, { margin: 0, width: 240, color: { dark: "#0F172A", light: "#FFFFFF" } }) : null;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", layout: landscape ? "landscape" : "portrait", margin: 0, compress: true, info: { Title: `${v.heading} — ${v.studentName}`, Author: v.academyName } });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const W: number = doc.page.width;
    const H: number = doc.page.height;
    const ink = "#0F172A";
    const soft = "#64748B";

    // Frame: cream paper, accent band, double border.
    doc.rect(0, 0, W, H).fill("#FFFDF8");
    doc.rect(0, 0, W, 10).fill(accent);
    doc.rect(0, H - 10, W, 10).fill(accent);
    doc.lineWidth(2).strokeColor(accent).rect(24, 28, W - 48, H - 56).stroke();
    doc.lineWidth(0.6).strokeColor("#CBD5E1").rect(32, 36, W - 64, H - 72).stroke();

    if (v.stamp) {
      doc.save().rotate(-24, { origin: [W / 2, H / 2] }).font("Helvetica-Bold").fontSize(110).fillColor("#DC2626").fillOpacity(0.08);
      doc.text(v.stamp, 0, H / 2 - 60, { width: W, align: "center", lineBreak: false });
      doc.restore().fillOpacity(1);
    }

    const pad = landscape ? 90 : 64;
    const inner = W - pad * 2;
    let y = landscape ? 70 : 96;

    doc.font("Helvetica-Bold").fontSize(12).fillColor(accent).text(v.academyName.toUpperCase(), pad, y, { width: inner, align: "center", characterSpacing: 2 });
    y += 34;
    doc.font("Times-Bold").fontSize(landscape ? 38 : 34).fillColor(ink).text(v.heading, pad, y, { width: inner, align: "center" });
    y = doc.y + 10;
    doc.moveTo(W / 2 - 60, y).lineTo(W / 2 + 60, y).lineWidth(2).strokeColor(accent).stroke();
    y += 26;

    doc.font("Helvetica").fontSize(11).fillColor(soft).text("PROUDLY PRESENTED TO", pad, y, { width: inner, align: "center", characterSpacing: 1.5 });
    y += 24;
    doc.font("Times-BoldItalic").fontSize(landscape ? 40 : 36).fillColor(accent).text(v.studentName, pad, y, { width: inner, align: "center" });
    y = doc.y + 14;
    doc.font("Helvetica").fontSize(13).fillColor("#334155").text(fillPlaceholders(v.bodyText, v), pad + 30, y, { width: inner - 60, align: "center", lineGap: 4 });
    y = doc.y + 10;
    if (v.showGrade && v.grade != null) {
      doc.font("Helvetica-Bold").fontSize(12).fillColor(ink).text(`Final grade: ${v.grade}%`, pad, y, { width: inner, align: "center" });
    }

    // Footer: signers on the left/centre, QR + certificate id on the right.
    const footY = H - (landscape ? 150 : 250);
    const qrSize = 78;
    const signers = v.signers.length ? v.signers.slice(0, 3) : [{ name: v.instructorName, title: "Instructor" }];
    const signArea = (qr ? W - pad - qrSize - 40 : W - pad) - pad;
    const slot = signArea / signers.length;
    signers.forEach((s, i) => {
      const x = pad + slot * i + 10;
      const w = Math.min(slot - 20, 200);
      doc.moveTo(x, footY + 40).lineTo(x + w, footY + 40).lineWidth(0.8).strokeColor("#94A3B8").stroke();
      doc.font("Helvetica-Bold").fontSize(11).fillColor(ink).text(s.name, x, footY + 48, { width: w, align: "center", lineBreak: false, ellipsis: true });
      doc.font("Helvetica").fontSize(9).fillColor(soft).text(s.title, x, footY + 63, { width: w, align: "center", lineBreak: false, ellipsis: true });
    });
    if (qr) {
      const qx = W - pad - qrSize;
      doc.image(qr, qx, footY - 6, { width: qrSize, height: qrSize });
      doc.font("Helvetica").fontSize(7).fillColor(soft).text("Scan to verify", qx - 10, footY + qrSize, { width: qrSize + 20, align: "center" });
    }

    const meta = `Certificate ID: ${v.certificateNumber}   •   Completed: ${fmtDate(v.completedAt)}   •   Verify: ${v.verifyUrl}`;
    doc.font("Helvetica").fontSize(8).fillColor(soft).text(meta, pad, H - 58, { width: inner, align: "center", lineBreak: false });

    doc.end();
  });
}
