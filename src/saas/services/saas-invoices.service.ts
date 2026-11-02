import { BadRequestException, Injectable } from "@nestjs/common";
import type { SaasInvoiceStatus } from "../../../generated/prisma";
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
