import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { AuthUser } from "../../common/auth-user";
import { localToInstant } from "../../common/workspace-time";
import { MailService } from "../../auth/mail/mail.service";
import { PrismaService } from "../../prisma/prisma.service";
import { certificateStatus, revokeReasonText, revokeRuleErrors } from "../certificate-rules";
import { issuedInclude, toIssued } from "../certificate.mapper";
import type { IssuedCertificate, IssuedStatus } from "../certificates.types";
import type { BulkIdsDto, BulkRevokeDto, IssueCertificateDto, IssueEligibleDto, RevokeCertificateDto } from "../dto/certificate.dto";
import { validNow } from "./certificate-eligibility.service";
import { CertificateEventsService } from "./certificate-events.service";
import { CertificateIssuerService, type IssueActor } from "./certificate-issuer.service";
import { CertificatesQueryService } from "./certificates-query.service";

type Actor = AuthUser & IssueActor;

/** Write side of issued certificates: issue (single / eligible queue), revoke, restore, email, downloads, verify. */
@Injectable()
export class CertificateAdminService {
  private readonly logger = new Logger(CertificateAdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly query: CertificatesQueryService,
    private readonly issuer: CertificateIssuerService,
    private readonly events: CertificateEventsService,
    private readonly mail: MailService,
  ) {}

  async issue(user: AuthUser, dto: IssueCertificateDto): Promise<IssuedCertificate> {
    const actor = await this.actor(user);
    const institutionId = actor.institutionId ?? null;
    const course = await this.prisma.course.findUnique({ where: { id: dto.courseId }, select: { id: true, title: true } });
    if (!course) throw new NotFoundException("This course no longer exists.");
    const template = await this.issuer.activeTemplate(institutionId, course.id);
    if (!template) throw new BadRequestException("This course has no active certificate template. Assign one first.");
    const learner = await this.prisma.user.findFirst({ where: { id: dto.recipientId, institutionId, deletedAt: null }, select: { id: true, name: true, email: true } });
    if (!learner) throw new NotFoundException("Learner not found.");
    const enrolled = await this.prisma.enrollment.findUnique({ where: { userId_courseId: { userId: learner.id, courseId: course.id } }, select: { id: true } });
    if (!enrolled) throw new BadRequestException(`${learner.name} isn't enrolled in this course.`);
    if (template.showGrade && dto.grade === null) throw new BadRequestException("Enter the final grade shown on this certificate");

    const id = await this.issuer.issue({
      actor,
      institutionId,
      template,
      courseId: course.id,
      courseTitle: course.title,
      recipient: learner,
      grade: dto.grade,
      completedAt: localToInstant(dto.completedAt, "12:00")!,
      method: "MANUAL",
      sendEmail: dto.sendEmail,
      message: dto.note ? `Issued manually — ${dto.note}` : "Issued manually",
    });
    return toIssued(await this.query.mustFind(actor, id));
  }

  /** "Issue to all (N)": everyone in the course's eligible queue (learners holding a valid certificate are skipped). */
  async issueEligible(user: AuthUser, dto: IssueEligibleDto): Promise<{ issued: number; skipped: number }> {
    const actor = await this.actor(user);
    const queue = await this.query.eligible(actor, dto.courseId);
    if (!queue.length) return { issued: 0, skipped: 0 };
    const course = await this.prisma.course.findUniqueOrThrow({ where: { id: dto.courseId }, select: { title: true } });
    const template = await this.issuer.activeTemplate(actor.institutionId ?? null, dto.courseId);
    if (!template) throw new BadRequestException("This course has no active certificate template. Assign one first.");
    let issued = 0;
    for (const e of queue) {
      try {
        await this.issuer.issue({
          actor,
          institutionId: actor.institutionId ?? null,
          template,
          courseId: dto.courseId,
          courseTitle: course.title,
          recipient: e.recipient,
          grade: e.quizScore,
          completedAt: new Date(e.completedAt),
          method: "MANUAL",
          sendEmail: dto.sendEmail,
          message: "Issued manually — Bulk issue from eligible queue",
        });
        issued++;
      } catch (err) {
        this.logger.warn(`Bulk issue skipped ${e.recipient.id}: ${err instanceof Error ? err.message : err}`);
      }
    }
    return { issued, skipped: queue.length - issued };
  }

  async revoke(user: AuthUser, id: string, dto: RevokeCertificateDto): Promise<IssuedCertificate> {
    const errors = revokeRuleErrors(dto.reason, dto.details);
    if (errors.length) throw new BadRequestException(errors);
    const actor = await this.actor(user);
    await this.revokeOne(actor, await this.query.mustFind(actor, id), dto);
    return toIssued(await this.query.mustFind(actor, id));
  }

  async bulkRevoke(user: AuthUser, dto: BulkRevokeDto): Promise<{ revoked: number }> {
    const errors = revokeRuleErrors(dto.reason, dto.details);
    if (errors.length) throw new BadRequestException(errors);
    const actor = await this.actor(user);
    const rows = await this.bulkRows(actor, dto);
    for (const row of rows) await this.revokeOne(actor, row, dto);
    return { revoked: rows.length };
  }

  async restore(user: AuthUser, id: string): Promise<IssuedCertificate> {
    const actor = await this.actor(user);
    const row = await this.query.mustFind(actor, id);
    if (row.status !== "REVOKED") throw new BadRequestException("This certificate isn't revoked.");
    const other = await this.prisma.certificate.findFirst({ where: { userId: row.userId, courseId: row.courseId, id: { not: id }, ...validNow() }, select: { id: true } });
    if (other) throw new BadRequestException(`${row.user.name} already has a valid certificate for this course.`);
    await this.prisma.$transaction(async (tx) => {
      await tx.certificate.update({ where: { id }, data: { status: "VALID", revokedReason: "", revokedAt: null } });
      await this.events.log(id, "RESTORED", "Certificate restored", actor.name, actor.userId, tx);
    });
    return toIssued(await this.query.mustFind(actor, id));
  }

  async email(user: AuthUser, id: string): Promise<IssuedCertificate> {
    const actor = await this.actor(user);
    const row = await this.query.mustFind(actor, id);
    if (row.status === "REVOKED") throw new BadRequestException("Revoked certificates can't be emailed. Restore it first.");
    await this.issuer.email(id, actor.name, actor.userId);
    return toIssued(await this.query.mustFind(actor, id));
  }

  async bulkEmail(user: AuthUser, dto: BulkIdsDto): Promise<{ emailed: number; skipped: number }> {
    const actor = await this.actor(user);
    const rows = await this.bulkRows(actor, dto);
    const sendable = rows.filter((r) => r.status !== "REVOKED");
    for (const r of sendable) await this.issuer.email(r.id, actor.name, actor.userId);
    return { emailed: sendable.length, skipped: rows.length - sendable.length };
  }

  /** Count an admin download (the panel renders the file client-side). */
  async recordDownload(user: AuthUser, id: string): Promise<{ downloads: number }> {
    const actor = await this.actor(user);
    await this.query.mustFind(actor, id);
    const row = await this.prisma.$transaction(async (tx) => {
      const c = await tx.certificate.update({ where: { id }, data: { downloads: { increment: 1 } }, select: { downloads: true } });
      await this.events.log(id, "DOWNLOADED", "Downloaded by admin", actor.name, actor.userId, tx);
      return c;
    });
    return { downloads: row.downloads };
  }

  /** Verify modal: look a code up (case-insensitive) within the workspace and count the verification. */
  async verify(user: AuthUser, code: string): Promise<IssuedCertificate & { currentStatus: IssuedStatus }> {
    const actor = await this.actor(user);
    const row = await this.prisma.certificate.findFirst({
      where: { AND: [this.query.scope(actor), { OR: [{ verificationCode: { equals: code, mode: "insensitive" } }, { certificateNumber: { equals: code, mode: "insensitive" } }] }] },
      select: { id: true },
    });
    if (!row) throw new NotFoundException("No certificate matches this code.");
    await this.prisma.$transaction(async (tx) => {
      await tx.certificate.update({ where: { id: row.id }, data: { verifications: { increment: 1 } } });
      await this.events.log(row.id, "VERIFIED", "Verified from the admin panel", actor.name, actor.userId, tx);
    });
    const cert = toIssued(await this.query.mustFind(actor, row.id));
    return { ...cert, currentStatus: certificateStatus(cert) };
  }

  // ---------------------------------------------------------------- helpers

  private async revokeOne(actor: Actor, row: Awaited<ReturnType<CertificatesQueryService["mustFind"]>>, dto: RevokeCertificateDto) {
    if (row.status === "REVOKED") return;
    const reason = revokeReasonText(dto.reason, dto.details);
    await this.prisma.$transaction(async (tx) => {
      await tx.certificate.update({ where: { id: row.id }, data: { status: "REVOKED", revokedReason: reason, revokedAt: new Date() } });
      await this.events.log(row.id, "REVOKED", `Revoked: ${reason}`, actor.name, actor.userId, tx);
    });
    if (!dto.notifyLearner) return;
    const code = row.verificationCode || row.certificateNumber;
    try {
      await this.mail.sendAdminMessageEmail(
        row.user.email,
        row.user.name,
        actor.name,
        "Your certificate was revoked",
        `Your certificate ${code} for "${row.course?.title ?? "your course"}" has been revoked.\nReason: ${reason}`,
      );
      await this.events.log(row.id, "EMAILED", `Revocation notice emailed to ${row.user.email}`, "System");
    } catch (e) {
      this.logger.warn(`Revocation email for ${row.id} failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  /** Bulk targets in the workspace; unknown / other-workspace ids are a 404. */
  private async bulkRows(actor: Actor, dto: BulkIdsDto) {
    const ids = [...new Set(dto.ids)];
    const rows = await this.prisma.certificate.findMany({ where: { AND: [{ id: { in: ids } }, this.query.scope(actor)] }, include: issuedInclude });
    if (rows.length !== ids.length) throw new NotFoundException("Some of these certificates no longer exist.");
    return rows;
  }

  private async actor(user: AuthUser): Promise<Actor> {
    const u = await this.prisma.user.findUnique({ where: { id: user.userId }, select: { name: true } });
    return { ...user, name: u?.name ?? "Admin" };
  }
}
