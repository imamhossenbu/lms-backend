import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "../../../generated/prisma";
import { PrismaService } from "../../prisma/prisma.service";
import { SAAS_ROOT_DOMAIN } from "../../saas/saas.constants";
import { toSiteContent } from "../site-content";
import type { AcademySiteContent } from "../academy-site.types";
import type { MessageQueryDto, SubscriberQueryDto, UpdateWebsiteDto } from "./website.dto";

const csvCell = (v: string) => (/[",\n\r]/.test(v) || /^[=+\-@]/.test(v) ? `"${(/^[=+\-@]/.test(v) ? `'${v}` : v).replace(/"/g, '""')}"` : v);

/**
 * Admin panel › Website: the academy site's editable content (academy_sites) and its newsletter subscribers.
 * Every query is scoped to the caller's workspace.
 */
@Injectable()
export class AdminWebsiteService {
  constructor(private readonly prisma: PrismaService) {}

  private requireTenant(tenantId: string | null): string {
    if (!tenantId) throw new NotFoundException("The academy website is available for academy workspaces only.");
    return tenantId;
  }

  /** Public address of the academy site (verified custom domain, else <slug>.<root>, dev → ACADEMY_SITE_DEV_URL?academy=slug). */
  private async siteUrl(tenantId: string) {
    const inst = await this.prisma.institution.findUnique({ where: { id: tenantId }, select: { slug: true, customDomain: { select: { domain: true, status: true } } } });
    if (!inst) throw new NotFoundException("Workspace not found");
    if (inst.customDomain?.status === "VERIFIED") return `https://${inst.customDomain.domain}`;
    if (process.env.NODE_ENV !== "production") return `${(process.env.ACADEMY_SITE_DEV_URL || "http://localhost:3003").replace(/\/$/, "")}/?academy=${inst.slug}`;
    return `https://${inst.slug}.${process.env.SAAS_ROOT_DOMAIN || SAAS_ROOT_DOMAIN}`;
  }

  async get(tenantId: string | null): Promise<{ content: AcademySiteContent; siteUrl: string; updatedAt: Date | null }> {
    const t = this.requireTenant(tenantId);
    const row = await this.prisma.academySite.findUnique({ where: { institutionId: t } });
    return { content: toSiteContent(row?.content ?? {}), siteUrl: await this.siteUrl(t), updatedAt: row?.updatedAt ?? null };
  }

  async update(tenantId: string | null, dto: UpdateWebsiteDto) {
    const t = this.requireTenant(tenantId);
    // Saving makes the content the academy's own (drops any sample marker).
    const content = toSiteContent(dto) as unknown as Prisma.InputJsonValue;
    await this.prisma.academySite.upsert({ where: { institutionId: t }, create: { institutionId: t, content }, update: { content } });
    return this.get(t);
  }

  // ---------------------------------------------------------------- subscribers

  private where(t: string, q: Pick<SubscriberQueryDto, "q" | "status">): Prisma.NewsletterSubscriberWhereInput {
    return {
      institutionId: t,
      ...(q.status ? { status: q.status } : {}),
      ...(q.q ? { OR: [{ email: { contains: q.q, mode: "insensitive" } }, { name: { contains: q.q, mode: "insensitive" } }] } : {}),
    };
  }

  async subscribers(tenantId: string | null, q: SubscriberQueryDto) {
    const t = this.requireTenant(tenantId);
    const page = q.page ?? 1;
    const limit = q.limit ?? 10;
    const where = this.where(t, q);
    const since = new Date(Date.now() - 30 * 864e5);
    const [rows, total, all, subscribed, recent] = await Promise.all([
      this.prisma.newsletterSubscriber.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit, select: { id: true, email: true, name: true, status: true, source: true, createdAt: true, updatedAt: true } }),
      this.prisma.newsletterSubscriber.count({ where }),
      this.prisma.newsletterSubscriber.count({ where: { institutionId: t } }),
      this.prisma.newsletterSubscriber.count({ where: { institutionId: t, status: "SUBSCRIBED" } }),
      this.prisma.newsletterSubscriber.count({ where: { institutionId: t, status: "SUBSCRIBED", createdAt: { gte: since } } }),
    ]);
    return {
      data: rows,
      pagination: { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) },
      stats: { total: all, subscribed, unsubscribed: all - subscribed, last30Days: recent },
    };
  }

  private async own(t: string, id: string) {
    const row = await this.prisma.newsletterSubscriber.findFirst({ where: { id, institutionId: t }, select: { id: true } });
    if (!row) throw new NotFoundException("Subscriber not found");
  }

  async setStatus(tenantId: string | null, id: string, status: "SUBSCRIBED" | "UNSUBSCRIBED") {
    const t = this.requireTenant(tenantId);
    await this.own(t, id);
    return this.prisma.newsletterSubscriber.update({ where: { id }, data: { status }, select: { id: true, email: true, name: true, status: true, source: true, createdAt: true, updatedAt: true } });
  }

  async remove(tenantId: string | null, id: string) {
    const t = this.requireTenant(tenantId);
    await this.own(t, id);
    await this.prisma.newsletterSubscriber.delete({ where: { id } });
  }

  /** CSV of the matching subscribers (formula-injection safe). */
  async exportCsv(tenantId: string | null, q: SubscriberQueryDto) {
    const t = this.requireTenant(tenantId);
    const rows = await this.prisma.newsletterSubscriber.findMany({ where: this.where(t, q), orderBy: { createdAt: "desc" }, take: 50_000 });
    const lines = [["Email", "Name", "Status", "Source", "Subscribed at"], ...rows.map((r) => [r.email, r.name, r.status, r.source, r.createdAt.toISOString()])];
    return lines.map((l) => l.map(csvCell).join(",")).join("\r\n") + "\r\n";
  }

  // ---------------------------------------------------------------- contact messages

  async messages(tenantId: string | null, q: MessageQueryDto) {
    const t = this.requireTenant(tenantId);
    const page = q.page ?? 1;
    const limit = q.limit ?? 10;
    const where: Prisma.AcademyContactMessageWhereInput = {
      institutionId: t,
      ...(q.status ? { status: q.status } : { status: { not: "ARCHIVED" } }),
      ...(q.q
        ? { OR: [{ name: { contains: q.q, mode: "insensitive" } }, { email: { contains: q.q, mode: "insensitive" } }, { message: { contains: q.q, mode: "insensitive" } }] }
        : {}),
    };
    const [rows, total, unread] = await Promise.all([
      this.prisma.academyContactMessage.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit, omit: { ip: true } }),
      this.prisma.academyContactMessage.count({ where }),
      this.prisma.academyContactMessage.count({ where: { institutionId: t, status: "NEW" } }),
    ]);
    return { data: rows, pagination: { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) }, stats: { unread } };
  }

  async setMessageStatus(tenantId: string | null, id: string, status: string) {
    const t = this.requireTenant(tenantId);
    const row = await this.prisma.academyContactMessage.findFirst({ where: { id, institutionId: t }, select: { id: true } });
    if (!row) throw new NotFoundException("Message not found");
    return this.prisma.academyContactMessage.update({ where: { id }, data: { status }, omit: { ip: true } });
  }

  async removeMessage(tenantId: string | null, id: string) {
    const t = this.requireTenant(tenantId);
    const row = await this.prisma.academyContactMessage.findFirst({ where: { id, institutionId: t }, select: { id: true } });
    if (!row) throw new NotFoundException("Message not found");
    await this.prisma.academyContactMessage.delete({ where: { id } });
  }
}
