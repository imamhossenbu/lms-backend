import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { Prisma, type CertificateTemplate as TemplateRow } from "../../../generated/prisma";
import { MailService } from "../../auth/mail/mail.service";
import { instantToLocal } from "../../common/workspace-time";
import { NotificationService } from "../../notification/notification.service";
import { PrismaService } from "../../prisma/prisma.service";
import { addMonths, codePrefix, formatCode, meetsIssueRules, nextSequence } from "../certificate-rules";
import { verifyUrl } from "../certificates.constants";
import type { CertificateRecipient, IssueMethod } from "../certificates.types";
import { CertificateEligibilityService, validNow } from "./certificate-eligibility.service";
import { CertificateEventsService } from "./certificate-events.service";

export interface IssueActor {
  userId: string | null;
  name: string;
}

export interface IssueInput {
  actor: IssueActor;
  institutionId: string | null;
  template: TemplateRow;
  courseId: string;
  courseTitle: string;
  recipient: CertificateRecipient;
  grade: number | null;
  completedAt: Date;
  method: IssueMethod;
  sendEmail: boolean;
  /** ISSUED event message. */
  message: string;
}

const MAX_CODE_RETRIES = 5;

/**
 * Creates certificates: unique "EDU-HCF-2026-00042" codes, expiry from the template's validity, the Activity log,
 * the certificate email and the in-app notification. Used by admin issue, bulk issue and auto-issue on completion.
 */
@Injectable()
export class CertificateIssuerService {
  private readonly logger = new Logger(CertificateIssuerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: CertificateEventsService,
    private readonly eligibility: CertificateEligibilityService,
    private readonly mail: MailService,
    private readonly notifications: NotificationService,
  ) {}

  /** The workspace's ACTIVE template for a course. */
  activeTemplate(institutionId: string | null, courseId: string, extra: Prisma.CertificateTemplateWhereInput = {}) {
    return this.prisma.certificateTemplate.findFirst({
      where: { institutionId, status: "ACTIVE", courseIds: { has: courseId }, ...extra },
      orderBy: { updatedAt: "desc" },
    });
  }

  hasValid(userId: string, courseId: string) {
    return this.prisma.certificate.findFirst({ where: { userId, courseId, ...validNow() }, select: { id: true } });
  }

  async issue(input: IssueInput): Promise<string> {
    const { recipient, courseId } = input;
    if (await this.hasValid(recipient.id, courseId)) throw new BadRequestException(`${recipient.name} already has a valid certificate for this course.`);
    const previous = await this.prisma.certificate.findFirst({
      where: { userId: recipient.id, courseId },
      orderBy: { issuedAt: "desc" },
      select: { verificationCode: true },
    });

    const issuedAt = new Date();
    const prefix = codePrefix(input.courseTitle, Number(instantToLocal(issuedAt).date.slice(0, 4)));
    const months = input.template.validityMonths;

    let id: string | null = null;
    for (let attempt = 0; attempt < MAX_CODE_RETRIES && !id; attempt++) {
      const last = await this.prisma.certificate.findFirst({
        where: { certificateNumber: { startsWith: prefix } },
        orderBy: { certificateNumber: "desc" },
        select: { certificateNumber: true },
      });
      const code = formatCode(prefix, nextSequence(prefix, last?.certificateNumber ?? null) + attempt);
      try {
        id = await this.prisma.$transaction(async (tx) => {
          const cert = await tx.certificate.create({
            data: {
              userId: recipient.id,
              courseId,
              institutionId: input.institutionId,
              templateId: input.template.id,
              certificateNumber: code,
              verificationCode: code,
              certificateUrl: "",
              issuedAt,
              completedAt: input.completedAt,
              expiresAt: months ? addMonths(issuedAt, months) : null,
              grade: input.template.showGrade ? input.grade : null,
              method: input.method,
            },
          });
          await this.events.log(cert.id, "ISSUED", input.message, input.actor.name, input.actor.userId, tx);
          if (previous) await this.events.log(cert.id, "REISSUED", `Replaces ${previous.verificationCode}`, input.actor.name, input.actor.userId, tx);
          return cert.id;
        });
      } catch (e) {
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
      }
    }
    if (!id) throw new BadRequestException("We couldn't generate a certificate code. Please try again.");

    if (input.sendEmail) await this.email(id, "System", null);
    this.notifications.notify(recipient.id, "CERTIFICATE_ISSUED", { courseName: input.courseTitle }).catch(() => undefined);
    return id;
  }

  /** Send (or re-send) the certificate email, stamp emailedAt and log it. */
  async email(id: string, actorName: string, actorId: string | null) {
    const c = await this.prisma.certificate.findUniqueOrThrow({
      where: { id },
      include: { user: { select: { name: true, email: true } }, course: { select: { title: true } } },
    });
    const code = c.verificationCode || c.certificateNumber;
    await this.mail.sendCertificateEmail(c.user.email, c.user.name, c.course?.title ?? "your course", c.certificateUrl || verifyUrl(code), code);
    await this.prisma.$transaction(async (tx) => {
      await tx.certificate.update({ where: { id }, data: { emailedAt: new Date() } });
      await this.events.log(id, "EMAILED", `Emailed to ${c.user.email}`, actorName, actorId, tx);
    });
  }

  /**
   * Called when a learner's course progress changes: issues an AUTO certificate when the course's ACTIVE
   * auto-issue template rules are met and the learner has no valid certificate yet. Returns the new id or null.
   */
  async autoIssue(userId: string, courseId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { institutionId: true, deletedAt: true } });
    if (!user || user.deletedAt) return null;
    const institutionId = user.institutionId ?? null;
    const template = await this.activeTemplate(institutionId, courseId, { autoIssue: true });
    if (!template || (await this.hasValid(userId, courseId))) return null;
    const [progress] = await this.eligibility.courseProgress(courseId, { institutionId }, [userId]);
    if (!progress || !meetsIssueRules(template, progress)) return null;
    const course = await this.prisma.course.findUnique({ where: { id: courseId }, select: { title: true } });
    if (!course) return null;
    try {
      return await this.issue({
        actor: { userId: null, name: "System" },
        institutionId,
        template,
        courseId,
        courseTitle: course.title,
        recipient: progress.recipient,
        grade: progress.quizScore,
        completedAt: progress.completedAt,
        method: "AUTO",
        sendEmail: true,
        message: "Issued automatically when the course rules were met",
      });
    } catch (e) {
      this.logger.warn(`Auto-issue skipped for ${userId}/${courseId}: ${e instanceof Error ? e.message : e}`);
      return null;
    }
  }
}
