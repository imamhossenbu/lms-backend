import { Injectable, NotFoundException } from "@nestjs/common";
import type { Announcement, Prisma } from "../../../generated/prisma";
import type { AuthUser } from "../../common/auth-user";
import { paginated, skipTake, type Paginated } from "../../common/pagination";
import { PrismaService } from "../../prisma/prisma.service";
import type { BroadcastQueryDto, DeliveryQueryDto, EstimateQueryDto } from "../dto/broadcast.dto";
import { audienceWhere } from "../notification-audience";
import { broadcastOverview, deliveryByChannel, deliveryStats, opensTimeline } from "../notification-insights";
import { toBroadcast, toDelivery } from "../notification.mapper";
import type { BroadcastAudience, BroadcastDelivery, BroadcastDetail, BroadcastListItem } from "../notifications.types";

/** Read side of admin Broadcasts: list, overview cards, detail analytics, recipients table, audience estimate. */
@Injectable()
export class BroadcastsQueryService {
  constructor(private readonly prisma: PrismaService) {}

  scope(actor: Pick<AuthUser, "institutionId">) {
    return { institutionId: actor.institutionId ?? null };
  }

  async mustFind(actor: AuthUser, id: string): Promise<Announcement> {
    const row = await this.prisma.announcement.findFirst({ where: { id, ...this.scope(actor) } });
    if (!row) throw new NotFoundException("This broadcast no longer exists.");
    return row;
  }

  async list(actor: AuthUser, q: BroadcastQueryDto): Promise<Paginated<BroadcastListItem>> {
    const where: Prisma.AnnouncementWhereInput = { ...this.scope(actor) };
    if (q.status) where.status = q.status;
    if (q.audience) where.audience = q.audience;
    if (q.channel) where.channels = { has: q.channel };
    if (q.q) where.OR = [{ title: { contains: q.q, mode: "insensitive" } }, { message: { contains: q.q, mode: "insensitive" } }];
    const [rows, total] = await Promise.all([
      // Newest activity first: scheduled/sent time, else creation.
      this.prisma.announcement.findMany({ where, orderBy: [{ sendAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }], ...skipTake(q) }),
      this.prisma.announcement.count({ where }),
    ]);
    return paginated(await this.toListItems(rows), total, q);
  }

  async item(row: Announcement): Promise<BroadcastListItem> {
    return (await this.toListItems([row]))[0];
  }

  async overview(actor: AuthUser, now = new Date()) {
    const scope = this.scope(actor);
    const since = new Date(now.getTime() - 30 * 86_400_000);
    const [sent, scheduled, drafts] = await Promise.all([
      this.prisma.announcement.findMany({ where: { ...scope, status: "SENT", sendAt: { gt: since } }, select: { id: true } }),
      this.prisma.announcement.count({ where: { ...scope, status: "SCHEDULED" } }),
      this.prisma.announcement.count({ where: { ...scope, status: "DRAFT" } }),
    ]);
    const rows = sent.length
      ? await this.prisma.notificationDelivery.findMany({ where: { broadcastId: { in: sent.map((s) => s.id) } }, select: { userId: true, channel: true, status: true } })
      : [];
    return broadcastOverview({ sentLast30: sent.length, scheduled, drafts }, rows);
  }

  async detail(actor: AuthUser, id: string): Promise<BroadcastDetail> {
    const row = await this.mustFind(actor, id);
    const [item] = await this.toListItems([row]);
    const rows = await this.prisma.notificationDelivery.findMany({ where: { broadcastId: id }, select: { userId: true, channel: true, status: true, openedAt: true } });
    const { recipients, openRate: _o, courses, ...broadcast } = item;
    return {
      broadcast,
      courses,
      recipients,
      stats: deliveryStats(rows),
      byChannel: deliveryByChannel(rows),
      opensTimeline: broadcast.status === "SENT" ? opensTimeline(row.sendAt ?? row.createdAt, rows) : [],
    };
  }

  async deliveries(actor: AuthUser, id: string, q: DeliveryQueryDto): Promise<Paginated<BroadcastDelivery>> {
    await this.mustFind(actor, id);
    const where: Prisma.NotificationDeliveryWhereInput = { broadcastId: id };
    if (q.channel) where.channel = q.channel;
    if (q.status) where.status = q.status;
    if (q.q) where.user = { OR: [{ name: { contains: q.q, mode: "insensitive" } }, { email: { contains: q.q, mode: "insensitive" } }] };
    const [rows, total] = await Promise.all([
      this.prisma.notificationDelivery.findMany({
        where,
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: [{ user: { name: "asc" } }, { channel: "asc" }],
        ...skipTake(q),
      }),
      this.prisma.notificationDelivery.count({ where }),
    ]);
    return paginated(rows.map(toDelivery), total, q);
  }

  async estimate(actor: AuthUser, q: EstimateQueryDto): Promise<{ recipients: number }> {
    return { recipients: await this.countAudience(actor.institutionId ?? null, q.audience, q.courseIds) };
  }

  countAudience(institutionId: string | null, audience: BroadcastAudience, courseIds: string[]) {
    if (audience === "COURSE" && !courseIds.length) return Promise.resolve(0);
    return this.prisma.user.count({ where: audienceWhere(institutionId, audience, courseIds) });
  }

  /** Author names, course titles, recipients (sent = stored unique recipients, otherwise the live estimate) and open rate. */
  private async toListItems(rows: Announcement[]): Promise<BroadcastListItem[]> {
    if (!rows.length) return [];
    const authorIds = [...new Set(rows.map((r) => r.createdBy))];
    const courseIds = [...new Set(rows.flatMap((r) => (r.courseIds?.length ? r.courseIds : r.courseId ? [r.courseId] : [])))];
    const sentIds = rows.filter((r) => (r.status ?? "SENT") === "SENT").map((r) => r.id);
    const [authors, courses, grouped] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, name: true } }),
      courseIds.length ? this.prisma.course.findMany({ where: { id: { in: courseIds } }, select: { id: true, title: true } }) : [],
      sentIds.length
        ? this.prisma.notificationDelivery.groupBy({ by: ["broadcastId", "status"], where: { broadcastId: { in: sentIds } }, _count: { _all: true } })
        : [],
    ]);
    const authorName = new Map(authors.map((a) => [a.id, a.name]));
    const courseTitle = new Map(courses.map((c) => [c.id, c.title]));

    return Promise.all(
      rows.map(async (row) => {
        const broadcast = toBroadcast(row, authorName.get(row.createdBy) ?? "Admin");
        const counts = grouped.filter((g) => g.broadcastId === row.id);
        const n = (s: string[]) => counts.filter((g) => s.includes(g.status)).reduce((a, g) => a + g._count._all, 0);
        const delivered = n(["DELIVERED", "OPENED", "CLICKED"]);
        const opened = n(["OPENED", "CLICKED"]);
        const sent = broadcast.status === "SENT";
        return {
          ...broadcast,
          recipients: sent ? row.recipientCount : await this.countAudience(row.institutionId, broadcast.audience, broadcast.courseIds),
          openRate: sent ? (delivered ? Math.round((opened / delivered) * 1000) / 10 : 0) : null,
          courses: broadcast.courseIds.map((id) => ({ id, title: courseTitle.get(id) ?? "Deleted course" })),
        };
      }),
    );
  }
}
