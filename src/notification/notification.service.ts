import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { defaultTemplateFor, TRIGGER_CATEGORY } from "../notifications/notification-templates.defaults";
import { renderTemplate, templateSlug } from "../notifications/notification.mapper";
import { TEMPLATE_TRIGGERS } from "../notifications/notifications.constants";
import type { TemplateTrigger } from "../notifications/notifications.types";

/**
 * Template-driven in-app notifications for other domains (e.g. certificates). Uses the recipient's institution
 * template (edited at /admin/notifications/templates), falling back to the built-in default.
 * Best effort: never throws, so a notification problem can't break the action that triggered it.
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * `notify(userId, "CERTIFICATE_ISSUED", { course_title: "React" }, { href: "/certificates" })`.
   * `{student_name}` is filled from the user. Returns the created notification id, or null when skipped.
   */
  async notify(userId: string, trigger: TemplateTrigger | string, vars: Record<string, string> = {}, opts: { href?: string } = {}): Promise<string | null> {
    try {
      if (!TEMPLATE_TRIGGERS.includes(trigger as TemplateTrigger)) {
        this.logger.warn(`Unknown notification trigger "${trigger}"`);
        return null;
      }
      const t = trigger as TemplateTrigger;
      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { name: true, institutionId: true } });
      if (!user) return null;
      const stored = await this.prisma.notificationTemplate.findUnique({ where: { slug: templateSlug(user.institutionId, t) } });
      const fallback = defaultTemplateFor(t);
      const enabled = stored ? stored.locked || stored.enabled : fallback.enabled;
      const channels = stored?.channels?.length ? stored.channels : fallback.channels;
      if (!enabled || !channels.includes("IN_APP")) return null;

      const values = { student_name: user.name, ...vars };
      const n = await this.prisma.notification.create({
        data: {
          userId,
          institutionId: user.institutionId,
          title: renderTemplate(stored?.title ?? fallback.subject, values),
          message: renderTemplate(stored?.message ?? fallback.body, values),
          type: t,
          category: TRIGGER_CATEGORY[t],
          href: opts.href ?? "",
        },
      });
      return n.id;
    } catch (err: any) {
      this.logger.error(`notify(${trigger}) failed: ${err?.message ?? err}`);
      return null;
    }
  }
}
