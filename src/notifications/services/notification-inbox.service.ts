import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "../../../generated/prisma";
import { paginated, skipTake, type Paginated } from "../../common/pagination";
import { PrismaService } from "../../prisma/prisma.service";
import type { InboxQueryDto } from "../dto/inbox.dto";
import { inboxStats, unreadByCategory } from "../notification-insights";
import { toInboxItem } from "../notification.mapper";
import type { AdminNotification } from "../notifications.types";

/**
 * One user's own in-app notifications — the admin Inbox tab and the user-facing /notification API share it.
 * Every query is scoped to `userId`, so nobody can touch another user's rows.
 * Reading / clicking a broadcast notification also advances its delivery row (OPENED / CLICKED).
 */
@Injectable()
export class NotificationInboxService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, q: InboxQueryDto): Promise<Paginated<AdminNotification>> {
    const where = this.where(userId, q);
    const [rows, total] = await Promise.all([
      this.prisma.notification.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], ...skipTake(q) }),
      this.prisma.notification.count({ where }),
    ]);
    return paginated(rows.map(toInboxItem), total, q);
  }

  async stats(userId: string) {
    const rows = await this.prisma.notification.findMany({ where: { userId } });
    const items = rows.map(toInboxItem);
    return { ...inboxStats(items), unreadByCategory: unreadByCategory(items) };
  }

  async unreadCount(userId: string): Promise<{ count: number }> {
    return { count: await this.prisma.notification.count({ where: { userId, isRead: false, isArchived: false } }) };
  }

  async markRead(userId: string, ids: string[] | "all", isRead = true): Promise<{ updated: number }> {
    const now = new Date();
    const where: Prisma.NotificationWhereInput = { userId, ...(ids === "all" ? { isArchived: false } : { id: { in: ids } }) };
    const { count } = await this.prisma.notification.updateMany({ where, data: { isRead, readAt: isRead ? now : null } });
    if (isRead) {
      await this.prisma.notificationDelivery.updateMany({
        where: { userId, channel: "IN_APP", status: "DELIVERED", ...(ids === "all" ? {} : { notificationId: { in: ids } }) },
        data: { status: "OPENED", openedAt: now },
      });
    }
    return { updated: count };
  }

  /** Archiving also marks read (panel behaviour). */
  async archive(userId: string, ids: string[] | "all", isArchived = true): Promise<{ updated: number }> {
    const where: Prisma.NotificationWhereInput = { userId, ...(ids === "all" ? {} : { id: { in: ids } }) };
    if (isArchived) await this.markRead(userId, ids);
    const { count } = await this.prisma.notification.updateMany({ where, data: { isArchived } });
    return { updated: count };
  }

  async remove(userId: string, ids: string[]): Promise<{ deleted: number }> {
    const { count } = await this.prisma.notification.deleteMany({ where: { userId, id: { in: ids } } });
    return { deleted: count };
  }

  async removeOne(userId: string, id: string): Promise<{ id: string }> {
    const { count } = await this.prisma.notification.deleteMany({ where: { userId, id } });
    if (!count) throw new NotFoundException("This notification no longer exists.");
    return { id };
  }

  /** Opened the link of a notification: read + delivery CLICKED. Returns where to go. */
  async click(userId: string, id: string): Promise<{ id: string; href: string }> {
    const n = await this.prisma.notification.findFirst({ where: { id, userId } });
    if (!n) throw new NotFoundException("This notification no longer exists.");
    const now = new Date();
    await this.markRead(userId, [id]);
    await this.prisma.notificationDelivery.updateMany({ where: { userId, notificationId: id, status: { in: ["DELIVERED", "OPENED"] } }, data: { status: "CLICKED", clickedAt: now } });
    return { id, href: n.href ?? "" };
  }

  async markOneRead(userId: string, id: string): Promise<AdminNotification> {
    const n = await this.prisma.notification.findFirst({ where: { id, userId } });
    if (!n) throw new NotFoundException("This notification no longer exists.");
    await this.markRead(userId, [id]);
    return toInboxItem({ ...n, isRead: true });
  }

  private where(userId: string, q: InboxQueryDto): Prisma.NotificationWhereInput {
    const where: Prisma.NotificationWhereInput = { userId };
    if (q.status === "archived") where.isArchived = true;
    else {
      where.isArchived = false;
      if (q.status === "unread") where.isRead = false;
    }
    if (q.category) where.category = q.category;
    if (q.priority) where.priority = q.priority;
    if (q.q) where.OR = [{ title: { contains: q.q, mode: "insensitive" } }, { message: { contains: q.q, mode: "insensitive" } }];
    return where;
  }
}
