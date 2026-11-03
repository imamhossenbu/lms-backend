import { Injectable, NotFoundException } from "@nestjs/common";
import { certificateStatus } from "../certificates/certificate-rules";
import { issuedInclude, toIssued, toTemplate } from "../certificates/certificate.mapper";
import { verifyUrl } from "../certificates/certificates.constants";
import type { CertificateTemplate, IssuedCertificate, IssuedStatus } from "../certificates/certificates.types";
import { CertificateEventsService } from "../certificates/services/certificate-events.service";
import { CertificateIssuerService } from "../certificates/services/certificate-issuer.service";
import { PrismaService } from "../prisma/prisma.service";

/** A learner's own certificate, ready to render client-side like the admin panel does. */
export interface StudentCertificate extends Omit<IssuedCertificate, "downloads" | "verifications" | "emailedAt" | "revokedReason"> {
  /** VALID / REVOKED / EXPIRED (derived). */
  currentStatus: IssuedStatus;
  verifyUrl: string;
  template: CertificateTemplate | null;
}

/** Public verification result — no email address or internal counters. */
export interface PublicCertificate {
  code: string;
  status: IssuedStatus;
  recipientName: string;
  courseTitle: string;
  grade: number | null;
  completedAt: string;
  issuedAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  template: CertificateTemplate | null;
}

const withTemplate = { ...issuedInclude, template: true } as const;

/** Learner + public side of certificates. Admins manage them at /admin/certificates. */
@Injectable()
export class CertificateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly issuer: CertificateIssuerService,
    private readonly events: CertificateEventsService,
  ) {}

  async getUserCertificates(userId: string): Promise<StudentCertificate[]> {
    const rows = await this.prisma.certificate.findMany({ where: { userId }, include: withTemplate, orderBy: [{ issuedAt: "desc" }, { id: "asc" }] });
    return rows.map((r) => this.toStudent(r));
  }

  async getMine(userId: string, id: string): Promise<StudentCertificate> {
    return this.toStudent(await this.mustOwn(userId, id));
  }

  async recordDownload(userId: string, id: string): Promise<{ downloads: number }> {
    await this.mustOwn(userId, id);
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
    return this.prisma.$transaction(async (tx) => {
      const c = await tx.certificate.update({ where: { id }, data: { downloads: { increment: 1 } }, select: { downloads: true } });
      await this.events.log(id, "DOWNLOADED", "Downloaded by the learner", user?.name ?? "Learner", userId, tx);
      return c;
    });
  }

  /** Public route: /certificate/verify/:code (case-insensitive). Counts the verification. */
  async verifyCertificate(code: string): Promise<PublicCertificate> {
    const row = await this.prisma.certificate.findFirst({
      where: { OR: [{ verificationCode: { equals: code, mode: "insensitive" } }, { certificateNumber: { equals: code, mode: "insensitive" } }] },
      include: withTemplate,
    });
    if (!row) throw new NotFoundException("No certificate matches this code.");
    await this.prisma.$transaction(async (tx) => {
      await tx.certificate.update({ where: { id: row.id }, data: { verifications: { increment: 1 } } });
      await this.events.log(row.id, "VERIFIED", "Verified on the public verification page", "Public", null, tx);
    });
    const c = toIssued(row);
    return {
      code: c.code,
      status: certificateStatus(c),
      recipientName: c.recipient.name,
      courseTitle: c.courseTitle,
      grade: c.grade,
      completedAt: c.completedAt,
      issuedAt: c.issuedAt,
      expiresAt: c.expiresAt,
      revokedAt: c.revokedAt,
      template: row.template ? toTemplate(row.template) : null,
    };
  }

  /** Enrollment progress hook: issue automatically when the course's auto-issue template rules are met. */
  autoIssue(userId: string, courseId: string) {
    return this.issuer.autoIssue(userId, courseId);
  }

  // ---------------------------------------------------------------- helpers

  private async mustOwn(userId: string, id: string) {
    const row = await this.prisma.certificate.findFirst({ where: { id, userId }, include: withTemplate });
    if (!row) throw new NotFoundException("This certificate no longer exists.");
    return row;
  }

  private toStudent(row: Parameters<typeof toIssued>[0] & { template: Parameters<typeof toTemplate>[0] | null }): StudentCertificate {
    const { downloads: _d, verifications: _v, emailedAt: _e, revokedReason: _r, ...c } = toIssued(row);
    return { ...c, currentStatus: certificateStatus(c), verifyUrl: verifyUrl(c.code), template: row.template ? toTemplate(row.template) : null };
  }
}
