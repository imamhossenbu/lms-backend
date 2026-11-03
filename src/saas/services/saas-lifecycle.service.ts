import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { quoteDiscount } from "../coupons/coupon-billing";
import { cycleLabel, money, periodEndFrom, priceFor, round2, subscriptionPrice } from "../saas.math";
import type { InstitutionView } from "../saas.types";
import { SaasCoreService } from "./saas-core.service";
import { SaasPaymentGateway } from "./saas-payment.gateway";

/** Safety cap when a server was down for a long time: renew at most this many missed periods per run. */
const MAX_PERIODS_PER_RUN = 24;

export interface LifecycleReport {
  trialsConverted: number;
  trialsExpired: number;
  cancelledAtPeriodEnd: number;
  renewed: number;
  renewalsFailed: number;
}

/**
 * Time-based subscription transitions (runs hourly, and on demand from the Owner Console):
 *  - TRIALING past trialEndsAt → charged and ACTIVE when a payment method is on file, otherwise CANCELLED (TRIAL_EXPIRED)
 *  - ACTIVE with cancelAtPeriodEnd past currentPeriodEnd → CANCELLED
 *  - ACTIVE past currentPeriodEnd → next period + invoice; a declined charge leaves it PAST_DUE
 * Charges are net of the institution's running coupon (quoteDiscount); a 100% discount needs no charge.
 * Every transition is guarded by a conditional update, so concurrent runs never double-bill.
 */
@Injectable()
export class SaasLifecycleService {
  private readonly logger = new Logger(SaasLifecycleService.name);
  private running = false;

  constructor(
    private readonly core: SaasCoreService,
    private readonly gateway: SaasPaymentGateway,
  ) {}

  @Cron(CronExpression.EVERY_HOUR, { name: "saas-lifecycle" })
  async scheduledRun() {
    if (this.running) return;
    this.running = true;
    try {
      const report = await this.run();
      const total = Object.values(report).reduce((a, b) => a + b, 0);
      if (total) this.logger.log(`Lifecycle: ${JSON.stringify(report)}`);
    } catch (err: any) {
      this.logger.error(`Lifecycle run failed: ${err?.message ?? err}`);
    } finally {
      this.running = false;
    }
  }

  async run(now = new Date()): Promise<LifecycleReport> {
    const report: LifecycleReport = { trialsConverted: 0, trialsExpired: 0, cancelledAtPeriodEnd: 0, renewed: 0, renewalsFailed: 0 };
    const due = await this.core.prisma.institution.findMany({
      where: {
        OR: [
          { status: "TRIALING", trialEndsAt: { lte: now } },
          { status: "ACTIVE", currentPeriodEnd: { lte: now } },
        ],
      },
      select: { id: true },
    });
    for (const { id } of due) {
      try {
        const inst = await this.core.mustInstitution(this.core.prisma, id);
        if (inst.subscription.status === "TRIALING") await this.endTrial(inst, now, report);
        else if (inst.subscription.cancelAtPeriodEnd) await this.cancelAtPeriodEnd(inst, report);
        else await this.renew(inst, now, report);
      } catch (err: any) {
        this.logger.error(`Lifecycle failed for institution ${id}: ${err?.message ?? err}`);
      }
    }
    return report;
  }

  // ---------------------------------------------------------------- transitions

  private async endTrial(inst: InstitutionView, now: Date, report: LifecycleReport) {
    const s = inst.subscription;
    const plan = await this.core.mustPlan(this.core.prisma, s.planId);
    const amount = priceFor(plan, s.cycle);
    const discount = amount > 0 ? await quoteDiscount(this.core.prisma, inst.id, { planId: plan.id, cycle: s.cycle, amount, at: now }) : null;
    const due = round2(amount - (discount?.amount ?? 0));
    const charge = amount <= 0 ? null : due <= 0 ? { ok: true as const } : s.paymentMethod ? await this.gateway.charge(s.paymentMethod, due) : null;

    await this.core.tx(async (tx) => {
      // Guard: only act if it is still the same trial (another run may have handled it).
      if (charge?.ok) {
        const periodEnd = periodEndFrom(now, s.cycle);
        const res = await tx.institution.updateMany({
          where: { id: inst.id, status: "TRIALING", trialEndsAt: new Date(s.trialEndsAt!) },
          data: { status: "ACTIVE", startedAt: now, currentPeriodStart: now, currentPeriodEnd: periodEnd },
        });
        if (res.count === 0) return;
        await this.core.event(tx, inst.id, "TRIAL_CONVERTED", `Trial ended — converted to ${plan.name} (${cycleLabel(s.cycle)})`, "System");
        await this.core.addInvoice(tx, inst, {
          planId: plan.id,
          cycle: s.cycle,
          amount,
          periodStart: now,
          periodEnd,
          paid: true,
          description: `${plan.name} plan — ${cycleLabel(s.cycle)} subscription`,
          discount,
        });
        report.trialsConverted++;
      } else {
        const res = await tx.institution.updateMany({
          where: { id: inst.id, status: "TRIALING", trialEndsAt: new Date(s.trialEndsAt!) },
          data: { status: "CANCELLED", cancelledAt: new Date(s.trialEndsAt!), currentPeriodEnd: new Date(s.trialEndsAt!) },
        });
        if (res.count === 0) return;
        const why = !s.paymentMethod ? "no payment method on file" : amount <= 0 ? "plan needs a contract price" : "card declined";
        await this.core.event(tx, inst.id, "TRIAL_EXPIRED", `Free trial on ${plan.name} ended — ${why}`, "System");
        report.trialsExpired++;
      }
    });
  }

  private async cancelAtPeriodEnd(inst: InstitutionView, report: LifecycleReport) {
    const end = new Date(inst.subscription.currentPeriodEnd);
    await this.core.tx(async (tx) => {
      const res = await tx.institution.updateMany({
        where: { id: inst.id, status: "ACTIVE", cancelAtPeriodEnd: true, currentPeriodEnd: end },
        data: { status: "CANCELLED", cancelAtPeriodEnd: false, cancelledAt: end },
      });
      if (res.count === 0) return;
      await this.core.event(tx, inst.id, "CANCELLED", "Subscription ended at the end of the billing period", "System");
      report.cancelledAtPeriodEnd++;
    });
  }

  /** Rolls the subscription forward period by period until it is current, billing each period. */
  private async renew(inst: InstitutionView, now: Date, report: LifecycleReport) {
    const plans = await this.core.plans();
    const plan = plans.find((p) => p.id === inst.subscription.planId);
    const amount = subscriptionPrice(plans, inst);

    for (let i = 0; i < MAX_PERIODS_PER_RUN; i++) {
      const current = await this.core.mustInstitution(this.core.prisma, inst.id);
      const s = current.subscription;
      if (s.status !== "ACTIVE" || new Date(s.currentPeriodEnd) > now) return;

      const start = new Date(s.currentPeriodEnd);
      const end = periodEndFrom(start, s.cycle);
      const discount = amount > 0 ? await quoteDiscount(this.core.prisma, inst.id, { planId: s.planId, cycle: s.cycle, amount, at: start }) : null;
      const due = round2(amount - (discount?.amount ?? 0));
      const charge = due > 0 ? await this.gateway.charge(s.paymentMethod, due) : { ok: true as const };

      const advanced = await this.core.tx(async (tx) => {
        const res = await tx.institution.updateMany({
          where: { id: inst.id, status: "ACTIVE", currentPeriodEnd: start },
          data: { currentPeriodStart: start, currentPeriodEnd: end, ...(charge.ok ? {} : { status: "PAST_DUE" }) },
        });
        if (res.count === 0) return false;
        if (amount > 0) {
          const invoice = await this.core.addInvoice(tx, current, {
            planId: s.planId,
            cycle: s.cycle,
            amount,
            periodStart: start,
            periodEnd: end,
            paid: charge.ok,
            description: `${plan?.name ?? s.planId} plan — ${cycleLabel(s.cycle)} renewal`,
            discount,
          });
          if (!charge.ok) {
            await tx.saasInvoice.update({ where: { id: invoice.id }, data: { status: "FAILED" } });
            const reason = charge.reason === "NO_PAYMENT_METHOD" ? "no payment method on file" : "card declined";
            await this.core.event(tx, inst.id, "PAYMENT_FAILED", `Renewal of ${money(invoice.total)} failed — ${reason} (${invoice.number})`, "System");
          }
        }
        return true;
      });
      if (!advanced) return;
      if (charge.ok) report.renewed++;
      else {
        report.renewalsFailed++;
        return; // PAST_DUE now — stop rolling until it is settled.
      }
    }
  }
}
