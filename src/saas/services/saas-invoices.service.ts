import { BadRequestException, Injectable } from "@nestjs/common";
import type { Prisma, SaasInvoiceStatus } from "../../../generated/prisma";
import { paginated, skipTake, type Paginated } from "../../common/pagination";
import { localToInstant } from "../../common/workspace-time";
import type { InvoicePageQueryDto } from "../dto/subscription.dto";
import { toInvoiceView } from "../saas.mapper";
import { money } from "../saas.math";
import type { InvoiceView, SaasActorKind } from "../saas.types";
import { SaasCoreService } from "./saas-core.service";
import { SaasPaymentGateway } from "./saas-payment.gateway";

const UNPAID: SaasInvoiceStatus[] = ["OPEN", "FAILED"];

/** SaaS invoices: list, retry (charge), refund, mark paid offline, void. */
@Injectable()
export class SaasInvoicesService {
  constructor(
    private readonly core: SaasCoreService,
    private readonly gateway: SaasPaymentGateway,
  ) {}

  async list(filter: { institutionId?: string; status?: SaasInvoiceStatus } = {}): Promise<InvoiceView[]> {
    const rows = await this.core.prisma.saasInvoice.findMany({
      where: { ...(filter.institutionId ? { institutionId: filter.institutionId } : {}), ...(filter.status ? { status: filter.status } : {}) },
      orderBy: { issuedAt: "desc" },
    });
    return rows.map(toInvoiceView);
  }

  /** The console's invoices table: search (number / institution), status, plan, issued range, sort, one page. */
  async page(q: InvoicePageQueryDto): Promise<Paginated<InvoiceView>> {
    const from = q.from ? localToInstant(q.from, "00:00") : null;
    const to = q.to ? localToInstant(q.to, "23:59") : null;
    const where: Prisma.SaasInvoiceWhereInput = {
      ...(q.status && { status: q.status }),
      ...(q.planId && { planId: q.planId }),
      ...((from || to) && { issuedAt: { ...(from && { gte: from }), ...(to && { lte: new Date(to.getTime() + 59_999) }) } }),
      ...(q.q && {
        OR: [{ number: { contains: q.q, mode: "insensitive" as const } }, { institution: { name: { contains: q.q, mode: "insensitive" as const } } }],
      }),
    };
    const orderBy: Prisma.SaasInvoiceOrderByWithRelationInput[] = [q.sort === "amount" ? { total: q.dir } : { issuedAt: q.dir }, { id: "asc" }];
    const [rows, total] = await Promise.all([
      this.core.prisma.saasInvoice.findMany({ where, orderBy, ...skipTake(q) }),
      this.core.prisma.saasInvoice.count({ where }),
    ]);
    return paginated(rows.map(toInvoiceView), total, q);
  }

  /** Invoices page KPIs over every invoice: collected this / last month (Asia/Dhaka months), open, failed, refunded. */
  async stats(now = new Date()) {
    const local = new Date(now.getTime() + 6 * 3_600_000);
    const ym = (y: number, m: number) => `${new Date(Date.UTC(y, m, 1)).getUTCFullYear()}-${String(new Date(Date.UTC(y, m, 1)).getUTCMonth() + 1).padStart(2, "0")}-01`;
    const monthStart = localToInstant(ym(local.getUTCFullYear(), local.getUTCMonth()), "00:00")!;
    const lastMonthStart = localToInstant(ym(local.getUTCFullYear(), local.getUTCMonth() - 1), "00:00")!;
    const sum = async (where: Prisma.SaasInvoiceWhereInput) => {
      const r = await this.core.prisma.saasInvoice.aggregate({ where, _sum: { total: true }, _count: { _all: true } });
      return { count: r._count._all, total: money(Number(r._sum.total ?? 0)) };
    };
    const [collected, previous, open, failed, refunded] = await Promise.all([
      sum({ status: "PAID", paidAt: { gte: monthStart } }),
      sum({ status: "PAID", paidAt: { gte: lastMonthStart, lt: monthStart } }),
      sum({ status: "OPEN" }),
      sum({ status: "FAILED" }),
      sum({ status: "REFUNDED" }),
    ]);
    return { collectedThisMonth: collected.total, collectedLastMonth: previous.total, open, failed, refunded };
  }

  async one(id: string): Promise<InvoiceView> {
    return this.core.mustInvoice(this.core.prisma, id);
  }

  /** Throws unless the invoice belongs to `institutionId` (institution-scoped endpoints). */
  async assertOwnedBy(invoiceId: string, institutionId: string) {
    const inv = await this.core.mustInvoice(this.core.prisma, invoiceId);
    if (inv.institutionId !== institutionId) throw new BadRequestException("This invoice belongs to another institution.");
    return inv;
  }

  /** Charges the payment method on file. A decline marks the invoice FAILED, logs it and throws. */
  async retry(invoiceId: string, actor: SaasActorKind): Promise<InvoiceView> {
    const inv = await this.core.mustInvoice(this.core.prisma, invoiceId);
    if (!UNPAID.includes(inv.status)) throw new BadRequestException("Only failed or open invoices can be retried.");
    const inst = await this.core.mustInstitution(this.core.prisma, inv.institutionId);
    const pm = inst.subscription.paymentMethod;
    const charge = await this.gateway.charge(pm, inv.total);

    if (!charge.ok) {
      await this.core.tx(async (tx) => {
        await tx.saasInvoice.update({ where: { id: invoiceId }, data: { status: "FAILED" } });
        await this.core.event(tx, inst.id, "PAYMENT_FAILED", `Retry of ${inv.number} (${money(inv.total)}) failed — ${pm ? "card declined" : "no payment method"}`, "System");
      });
      const who = actor === "Institution" ? "Update your payment method and try again." : "Ask the institution to update their payment method.";
      throw new BadRequestException(pm ? `${pm.brand} •••• ${pm.last4} was declined. ${who}` : actor === "Institution" ? "Add a payment method first." : "No payment method on file — ask the institution to add one.");
    }

    return this.core.tx(async (tx) => {
      // Re-check inside the transaction so two concurrent retries can't both mark it paid.
      const res = await tx.saasInvoice.updateMany({ where: { id: invoiceId, status: { in: UNPAID } }, data: { status: "PAID", paidAt: new Date() } });
      if (res.count === 0) throw new BadRequestException("This invoice was already settled.");
      await this.core.event(tx, inst.id, "PAYMENT_SUCCEEDED", `Retry succeeded — ${money(inv.total)} charged to ${pm!.brand} •••• ${pm!.last4} (${inv.number})`, "System");
      await this.core.settleStatus(tx, inst.id);
      return this.core.mustInvoice(tx, invoiceId);
    });
  }

  async refund(invoiceId: string): Promise<InvoiceView> {
    return this.core.tx(async (tx) => {
      const inv = await this.core.mustInvoice(tx, invoiceId);
      if (inv.status !== "PAID") throw new BadRequestException("Only paid invoices can be refunded.");
      await tx.saasInvoice.update({ where: { id: invoiceId }, data: { status: "REFUNDED" } });
      await this.core.event(tx, inv.institutionId, "NOTE", `Invoice ${inv.number} refunded (${money(inv.total)})`, "Owner");
      return this.core.mustInvoice(tx, invoiceId);
    });
  }

  /** Records an offline payment (bank transfer, cash, manual bKash). */
  async markPaid(invoiceId: string): Promise<InvoiceView> {
    return this.core.tx(async (tx) => {
      const inv = await this.core.mustInvoice(tx, invoiceId);
      if (!UNPAID.includes(inv.status)) throw new BadRequestException("Only failed or open invoices can be marked as paid.");
      await tx.saasInvoice.update({ where: { id: invoiceId }, data: { status: "PAID", paidAt: new Date() } });
      await this.core.event(tx, inv.institutionId, "PAYMENT_SUCCEEDED", `${inv.number} marked as paid manually (${money(inv.total)})`, "Owner");
      await this.core.settleStatus(tx, inv.institutionId);
      return this.core.mustInvoice(tx, invoiceId);
    });
  }

  async void(invoiceId: string): Promise<InvoiceView> {
    return this.core.tx(async (tx) => {
      const inv = await this.core.mustInvoice(tx, invoiceId);
      if (!UNPAID.includes(inv.status)) throw new BadRequestException("Only unpaid invoices can be voided.");
      await tx.saasInvoice.update({ where: { id: invoiceId }, data: { status: "VOID" } });
      await this.core.event(tx, inv.institutionId, "NOTE", `Invoice ${inv.number} voided`, "Owner");
      await this.core.settleStatus(tx, inv.institutionId);
      return this.core.mustInvoice(tx, invoiceId);
    });
  }
}
