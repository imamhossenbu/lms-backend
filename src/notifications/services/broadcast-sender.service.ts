import { randomUUID } from "crypto";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron, CronExpression } from "@nestjs/schedule";
import type { Announcement } from "../../../generated/prisma";
import { MailService } from "../../auth/mail/mail.service";
import { PrismaService } from "../../prisma/prisma.service";
import { audienceWhere } from "../notification-audience";
import { broadcastEmailBody, planBroadcastDelivery, toBroadcast } from "../notification.mapper";
import { DELIVERY_ERRORS, EMAIL_BATCH_SIZE } from "../notifications.constants";

export interface SendReport {
  recipients: number;
  deliveries: number;
  failed: number;
}

/**
 * Delivery of broadcasts: in-app Notification rows + EMAIL via MailService (best effort, failures counted)
 * + PUSH (recorded FAILED until push devices exist). Also runs the scheduler that sends due SCHEDULED broadcasts.
 */
@Injectable()
export class BroadcastSenderService {
  private readonly logger = new Logger(BroadcastSenderService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE, { name: "notification-broadcasts" })
  async scheduledRun() {
    if (this.running) return;
    this.running = true;
    try {
      const sent = await this.sendDue();
      if (sent.length) this.logger.log(`Sent ${sent.length} scheduled broadcast(s)`);
    } catch (err: any) {
      this.logger.error(`Scheduled broadcasts failed: ${err?.message ?? err}`);
    } finally {
      this.running = false;
    }
  }

  /** Sends every SCHEDULED broadcast whose time has come. Each one is claimed atomically, so it's sent once. */
  async sendDue(now = new Date()): Promise<{ id: string; report: SendReport }[]> {
    const due = await this.prisma.announcement.findMany({ where: { status: "SCHEDULED", sendAt: { lte: now } }, orderBy: { sendAt: "asc" }, take: 20 });
    const done: { id: string; report: SendReport }[] = [];
    for (const row of due) {
      const { count } = await this.prisma.announcement.updateMany({ where: { id: row.id, status: "SCHEDULED" }, data: { status: "SENT" } });
      if (!count) continue; // cancelled / sent by someone else meanwhile
      try {
        done.push({ id: row.id, report: await this.deliver({ ...row, status: "SENT" }, now) });
      } catch (err: any) {
        this.logger.error(`Broadcast ${row.id} failed: ${err?.message ?? err}`);
      }
    }
    return done;
  }

  /** Deliver a broadcast that is already marked SENT. */
  async deliver(row: Announcement, now = new Date()): Promise<SendReport> {
    const b = toBroadcast(row, "");
    const recipients = await this.prisma.user.findMany({
      where: audienceWhere(row.institutionId, b.audience, b.courseIds, now),
      select: { id: true, name: true, email: true, institutionId: true },
    });
    const plan = planBroadcastDelivery({ id: row.id, title: b.title, messageHtml: b.messageHtml, channels: b.channels, priority: b.priority, ctaUrl: b.ctaUrl }, recipients, now, randomUUID);

    await this.prisma.$transaction([
      this.prisma.notification.createMany({ data: plan.notifications }),
      this.prisma.notificationDelivery.createMany({ data: plan.deliveries, skipDuplicates: true }),
      this.prisma.announcement.update({ where: { id: row.id }, data: { recipientCount: recipients.length, sendAt: row.sendAt ?? now } }),
    ]);

    const failedEmails = await this.sendEmails(row, plan.emails);
    if (failedEmails.length) {
      await this.prisma.notificationDelivery.updateMany({ where: { id: { in: failedEmails } }, data: { status: "FAILED", error: DELIVERY_ERRORS.email, deliveredAt: null } });
    }
    const failed = plan.deliveries.filter((d) => d.status === "FAILED").length + failedEmails.length;
    return { recipients: recipients.length, deliveries: plan.deliveries.length, failed };
  }

  /** Re-send FAILED email deliveries; returns how many went through. (PUSH can't be retried until devices exist.) */
  async retryFailedEmails(row: Announcement): Promise<number> {
    const failed = await this.prisma.notificationDelivery.findMany({
      where: { broadcastId: row.id, channel: "EMAIL", status: "FAILED" },
      include: { user: { select: { name: true, email: true } } },
    });
    const sendable = failed.filter((d) => d.user?.email);
    const stillFailed = new Set(await this.sendEmails(row, sendable.map((d) => ({ deliveryId: d.id, to: d.user.email, name: d.user.name }))));
    const ok = sendable.filter((d) => !stillFailed.has(d.id)).map((d) => d.id);
    if (ok.length) await this.prisma.notificationDelivery.updateMany({ where: { id: { in: ok } }, data: { status: "DELIVERED", error: "", deliveredAt: new Date() } });
    return ok.length;
  }

  /** Test email of a broadcast/template to one address. Throws when the mailer rejects it. */
  async sendTestEmail(to: string, name: string, sender: string, subject: string, body: string) {
    await this.mail.sendAdminMessageEmail(to, name, sender, subject, body);
  }

  /** Returns the delivery ids whose email was rejected. */
  private async sendEmails(row: Announcement, emails: { deliveryId: string; to: string; name: string }[]): Promise<string[]> {
    if (!emails.length) return [];
    const sender = await this.senderName(row);
    const appUrl = this.config.get<string>("STUDENT_APP_URL") || this.config.get<string>("FRONTEND_URL") || "";
    const body = broadcastEmailBody(toBroadcast(row, ""), appUrl);
    const failed: string[] = [];
    for (let i = 0; i < emails.length; i += EMAIL_BATCH_SIZE) {
      const batch = emails.slice(i, i + EMAIL_BATCH_SIZE);
      const results = await Promise.allSettled(batch.map((e) => this.mail.sendAdminMessageEmail(e.to, e.name, sender, row.title, body)));
      results.forEach((r, j) => r.status === "rejected" && failed.push(batch[j].deliveryId));
    }
    if (failed.length) this.logger.warn(`Broadcast ${row.id}: ${failed.length}/${emails.length} email(s) failed`);
    return failed;
  }

  private async senderName(row: Announcement): Promise<string> {
    if (row.institutionId) {
      const inst = await this.prisma.institution.findUnique({ where: { id: row.institutionId }, select: { name: true } });
      if (inst?.name) return inst.name;
    }
    const author = await this.prisma.user.findUnique({ where: { id: row.createdBy }, select: { name: true } });
    return author?.name ?? "Your academy";
  }
}
