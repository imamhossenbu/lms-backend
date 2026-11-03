import { Injectable, NotFoundException } from "@nestjs/common";
import { paginated, type Paginated } from "../../common/pagination";
import { toInstitutionView, toInvoiceView } from "../saas.mapper";
import { SaasCoreService } from "../services/saas-core.service";
import { alertSummary, attentionItems, filterAlerts } from "./alerts.rules";
import type { AlertSummary, AlertView, AttentionItem } from "./alerts.types";
import type { ListAlertsQueryDto } from "./dto/alerts.dto";

export interface AlertReadResult {
  updated: number;
  unread: number;
}

/**
 * Owner Console alerts: derived live from institutions / unpaid invoices (never stored); only the owner's
 * read-state is persisted, keyed by alert id. Read rows of alerts that went away are pruned on list,
 * so an alert that comes back later (e.g. a new past-due episode) shows as unread again.
 */
@Injectable()
export class AlertsService {
  constructor(private readonly core: SaasCoreService) {}

  private get prisma() {
    return this.core.prisma;
  }

  async current(now = Date.now()): Promise<AttentionItem[]> {
    const [plans, institutions, invoices] = await Promise.all([
      this.core.plans(),
      this.prisma.institution.findMany({ include: { customDomain: true }, orderBy: { createdAt: "desc" } }),
      this.prisma.saasInvoice.findMany({ where: { status: { in: ["OPEN", "FAILED"] } } }),
    ]);
    return attentionItems({ plans, institutions: institutions.map(toInstitutionView), invoices: invoices.map(toInvoiceView) }, now);
  }

  async list(userId: string, q: ListAlertsQueryDto): Promise<Paginated<AlertView> & { summary: AlertSummary }> {
    const items = await this.current();
    const ids = items.map((i) => i.id);
    await this.prisma.consoleAlertRead.deleteMany({ where: { userId, alertId: { notIn: ids } } });
    const reads = new Map(
      (await this.prisma.consoleAlertRead.findMany({ where: { userId, alertId: { in: ids } }, select: { alertId: true, readAt: true } })).map((r) => [r.alertId, r.readAt]),
    );
    const all: AlertView[] = items.map((i) => {
      const readAt = reads.get(i.id);
      return { ...i, read: !!readAt, readAt: readAt ? readAt.toISOString() : null };
    });
    const { rows, searched } = filterAlerts(all, q);
    const start = (q.page - 1) * q.limit;
    return { ...paginated(rows.slice(start, start + q.limit), rows.length, q), summary: alertSummary(all, searched) };
  }

  /** Marks the given alerts read (ids that aren't current alerts are ignored). */
  async markRead(userId: string, ids: string[]): Promise<AlertReadResult> {
    await this.ensureUser(userId);
    const current = new Set((await this.current()).map((i) => i.id));
    const res = await this.prisma.consoleAlertRead.createMany({
      data: [...new Set(ids)].filter((id) => current.has(id)).map((alertId) => ({ userId, alertId })),
      skipDuplicates: true,
    });
    return { updated: res.count, unread: await this.unreadCount(userId, current) };
  }

  async markUnread(userId: string, ids: string[]): Promise<AlertReadResult> {
    const res = await this.prisma.consoleAlertRead.deleteMany({ where: { userId, alertId: { in: ids } } });
    const current = new Set((await this.current()).map((i) => i.id));
    return { updated: res.count, unread: await this.unreadCount(userId, current) };
  }

  async markAllRead(userId: string): Promise<AlertReadResult> {
    await this.ensureUser(userId);
    const ids = (await this.current()).map((i) => i.id);
    const res = await this.prisma.consoleAlertRead.createMany({ data: ids.map((alertId) => ({ userId, alertId })), skipDuplicates: true });
    return { updated: res.count, unread: 0 };
  }

  private async unreadCount(userId: string, current: Set<string>) {
    const read = await this.prisma.consoleAlertRead.count({ where: { userId, alertId: { in: [...current] } } });
    return current.size - read;
  }

  private async ensureUser(userId: string) {
    const exists = await this.prisma.user.count({ where: { id: userId } });
    if (!exists) throw new NotFoundException("Your account no longer exists.");
  }
}
