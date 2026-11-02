import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, SaasEventType } from "../../../generated/prisma";
import { PrismaService } from "../../prisma/prisma.service";
import { toInstitutionView, toInvoiceView, toPlanView } from "../saas.mapper";
import { DAY_MS, money, round2, taxFor } from "../saas.math";
import type { BillingCycle, InstitutionView, InvoiceView, PlanView, SaasActorKind } from "../saas.types";

export type Tx = Prisma.TransactionClient;

/**
 * Shared building blocks for the SaaS services: loading rows inside a transaction, appending timeline events,
 * issuing invoices (atomic yearly numbering) and settling PAST_DUE once nothing is unpaid.
 */
@Injectable()
export class SaasCoreService {
  constructor(readonly prisma: PrismaService) {}

  /** Runs `fn` in an interactive transaction (all-or-nothing mutations). */
  tx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn, { timeout: 15_000, maxWait: 10_000 });
  }

  async plans(tx: Tx = this.prisma): Promise<PlanView[]> {
    return (await tx.saasPlan.findMany()).map(toPlanView);
  }

  async mustPlan(tx: Tx, id: string): Promise<PlanView> {
    const plan = await tx.saasPlan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException("This plan no longer exists.");
    return toPlanView(plan);
  }

  async mustInstitution(tx: Tx, id: string): Promise<InstitutionView> {
    const inst = await tx.institution.findUnique({ where: { id }, include: { customDomain: true } });
    if (!inst) throw new NotFoundException("This institution no longer exists.");
    return toInstitutionView(inst);
  }

  async mustInvoice(tx: Tx, id: string): Promise<InvoiceView> {
    const inv = await tx.saasInvoice.findUnique({ where: { id } });
    if (!inv) throw new NotFoundException("This invoice no longer exists.");
    return toInvoiceView(inv);
  }

  event(tx: Tx, institutionId: string, type: SaasEventType, message: string, actor: SaasActorKind = "Owner") {
    return tx.saasEvent.create({ data: { institutionId, type, message, actor } });
  }

  /** Next "EDP-<year>-00001" number from an atomic per-year counter (safe under concurrent requests). */
  async nextInvoiceNumber(tx: Tx, at: Date) {
    const year = at.getUTCFullYear();
    const counter = await tx.saasCounter.upsert({
      where: { key: `invoice-${year}` },
      create: { key: `invoice-${year}`, value: 1 },
      update: { value: { increment: 1 } },
    });
    return `EDP-${year}-${String(counter.value).padStart(5, "0")}`;
  }

  /** Issues an invoice (paid now, or OPEN with a 7-day due date) and logs it on the timeline. */
  async addInvoice(
    tx: Tx,
    inst: Pick<InstitutionView, "id" | "country">,
    opts: { planId: string; cycle: BillingCycle; amount: number; periodStart: Date; periodEnd: Date; paid: boolean; description: string },
  ): Promise<InvoiceView> {
    const issuedAt = new Date();
    const amount = round2(opts.amount);
    const tax = taxFor(inst.country, amount);
    const row = await tx.saasInvoice.create({
      data: {
        number: await this.nextInvoiceNumber(tx, issuedAt),
        institutionId: inst.id,
        planId: opts.planId,
        cycle: opts.cycle,
        amount,
        tax,
        total: round2(amount + tax),
        status: opts.paid ? "PAID" : "OPEN",
        issuedAt,
        dueAt: new Date(issuedAt.getTime() + (opts.paid ? 0 : 7 * DAY_MS)),
        paidAt: opts.paid ? issuedAt : null,
        periodStart: opts.periodStart,
        periodEnd: opts.periodEnd,
        description: opts.description,
      },
    });
    const invoice = toInvoiceView(row);
    if (opts.paid) await this.event(tx, inst.id, "PAYMENT_SUCCEEDED", `Payment of ${money(invoice.total)} received (${invoice.number})`, "System");
    else await this.event(tx, inst.id, "NOTE", `Invoice ${invoice.number} for ${money(invoice.total)} issued — awaiting payment`, "System");
    return invoice;
  }

  hasUnpaid(tx: Tx, institutionId: string) {
    return tx.saasInvoice.count({ where: { institutionId, status: { in: ["OPEN", "FAILED"] } } }).then((n) => n > 0);
  }

  /** Restores PAST_DUE → ACTIVE once no FAILED / OPEN invoice remains. */
  async settleStatus(tx: Tx, institutionId: string) {
    if (await this.hasUnpaid(tx, institutionId)) return;
    await tx.institution.updateMany({ where: { id: institutionId, status: "PAST_DUE" }, data: { status: "ACTIVE" } });
  }
}
