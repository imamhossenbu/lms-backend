import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import type { NotificationTemplate } from "../../../generated/prisma";
import type { AuthUser } from "../../common/auth-user";
import { PrismaService } from "../../prisma/prisma.service";
import type { UpdateTemplateDto } from "../dto/template.dto";
import { templatePlaceholderErrors } from "../notification-rules";
import { DEFAULT_TEMPLATES, SAMPLE_VALUES } from "../notification-templates.defaults";
import { renderTemplate, templateSlug, toTemplateItem } from "../notification.mapper";
import { TEMPLATE_TRIGGERS } from "../notifications.constants";
import type { NotificationTemplateItem } from "../notifications.types";
import { BroadcastSenderService } from "./broadcast-sender.service";

/**
 * Automated templates (one per trigger per institution). The set is fixed by the triggers, so the panel lists,
 * edits, toggles and test-sends them; missing rows are created from the defaults the first time they're read.
 */
@Injectable()
export class NotificationTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sender: BroadcastSenderService,
  ) {}

  private scope(actor: Pick<AuthUser, "institutionId">) {
    return { institutionId: actor.institutionId ?? null, trigger: { in: [...TEMPLATE_TRIGGERS] as string[] } };
  }

  async list(actor: AuthUser): Promise<NotificationTemplateItem[]> {
    await this.ensureDefaults(actor.institutionId ?? null);
    const rows = await this.prisma.notificationTemplate.findMany({ where: this.scope(actor) });
    const sent = await this.sentLast30(actor.institutionId ?? null);
    const order = (t: NotificationTemplate) => TEMPLATE_TRIGGERS.indexOf(t.trigger as (typeof TEMPLATE_TRIGGERS)[number]);
    return rows.sort((a, b) => order(a) - order(b)).map((t) => toTemplateItem(t, sent.get(t.trigger ?? "") ?? 0));
  }

  async detail(actor: AuthUser, id: string): Promise<NotificationTemplateItem> {
    const row = await this.mustFind(actor, id);
    const sent = await this.sentLast30(actor.institutionId ?? null);
    return toTemplateItem(row, sent.get(row.trigger ?? "") ?? 0);
  }

  async update(actor: AuthUser, id: string, dto: UpdateTemplateDto): Promise<NotificationTemplateItem> {
    const current = await this.mustFind(actor, id);
    const item = toTemplateItem(current, 0);
    const errors = templatePlaceholderErrors(item.trigger, dto);
    if (errors.length) throw new BadRequestException(errors);
    if (current.locked && !dto.enabled) throw new BadRequestException("Security emails can't be turned off.");
    await this.prisma.notificationTemplate.update({
      where: { id },
      data: { name: dto.name, title: dto.subject, message: dto.body, channels: [...new Set(dto.channels)], enabled: current.locked ? true : dto.enabled },
    });
    return this.detail(actor, id);
  }

  async setEnabled(actor: AuthUser, id: string, enabled: boolean): Promise<NotificationTemplateItem> {
    const current = await this.mustFind(actor, id);
    if (current.locked && !enabled) throw new BadRequestException("Security emails can't be turned off.");
    await this.prisma.notificationTemplate.update({ where: { id }, data: { enabled } });
    return this.detail(actor, id);
  }

  /** Email the template, filled with sample values, to the signed-in admin. */
  async sendTest(actor: AuthUser, id: string): Promise<{ email: string }> {
    const t = await this.mustFind(actor, id);
    const me = await this.prisma.user.findUnique({ where: { id: actor.userId }, select: { name: true, email: true } });
    const email = me?.email ?? actor.email;
    const vars = { ...SAMPLE_VALUES, student_name: me?.name ?? SAMPLE_VALUES.student_name };
    try {
      await this.sender.sendTestEmail(email, me?.name ?? "there", "Template test", `[Test] ${renderTemplate(t.title, vars)}`, renderTemplate(t.message, vars));
    } catch {
      throw new ServiceUnavailableException("We couldn't send the test email. Check the mail settings and try again.");
    }
    return { email };
  }

  private async mustFind(actor: AuthUser, id: string): Promise<NotificationTemplate> {
    const row = await this.prisma.notificationTemplate.findFirst({ where: { id, ...this.scope(actor) } });
    if (!row) throw new NotFoundException("This template no longer exists.");
    return row;
  }

  /** Create the institution's missing trigger templates from the defaults (idempotent: slug is unique). */
  private async ensureDefaults(institutionId: string | null) {
    const existing = await this.prisma.notificationTemplate.findMany({ where: { institutionId, trigger: { not: null } }, select: { trigger: true } });
    const have = new Set(existing.map((e) => e.trigger));
    const missing = DEFAULT_TEMPLATES.filter((d) => !have.has(d.trigger));
    if (!missing.length) return;
    await this.prisma.notificationTemplate.createMany({
      data: missing.map((d) => ({
        slug: templateSlug(institutionId, d.trigger),
        institutionId,
        trigger: d.trigger,
        name: d.name,
        title: d.subject,
        message: d.body,
        type: d.trigger,
        channels: d.channels,
        enabled: d.enabled,
        locked: d.locked,
      })),
      skipDuplicates: true,
    });
  }

  /** In-app sends per trigger in the last 30 days (Notification.type = trigger). */
  private async sentLast30(institutionId: string | null): Promise<Map<string, number>> {
    const since = new Date(Date.now() - 30 * 86_400_000);
    const grouped = await this.prisma.notification.groupBy({
      by: ["type"],
      where: { institutionId, type: { in: [...TEMPLATE_TRIGGERS] }, createdAt: { gte: since } },
      _count: { _all: true },
    });
    return new Map(grouped.map((g) => [g.type, g._count._all]));
  }
}
