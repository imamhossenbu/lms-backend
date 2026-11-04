import { BadRequestException, Injectable } from "@nestjs/common";
import type { SaasEventType, SaasSubscriptionStatus } from "../../../generated/prisma";
import { quoteDiscount } from "../coupons/coupon-billing";
import { CouponRedemptionsService } from "../coupons/services/coupon-redemptions.service";
import type { PaymentMethodDto } from "../dto/subscription.dto";
import { LIMIT_LABEL } from "../saas.constants";
import { cycleLabel, DAY_MS, fmtDate, fmtLimitValue, money, periodEndFrom, planChangePreview, priceFor, round2, subscriptionPrice } from "../saas.math";
import type { BillingCycle, InstitutionView, InvoiceView, SaasActorKind } from "../saas.types";
import { SaasCoreService } from "./saas-core.service";
import { SaasPaymentGateway } from "./saas-payment.gateway";
import { PlanAccessService } from "../../plan-access/plan-access.service";

export interface ChangePlanResult {
  institution: InstitutionView;
  invoice: InvoiceView | null;
  kind: "UPGRADE" | "DOWNGRADE" | "CYCLE";
}

/** Subscription lifecycle — shared by the Owner Console (actor "Owner") and institution billing (actor "Institution"). */
@Injectable()
export class SaasSubscriptionService {
  constructor(
    private readonly core: SaasCoreService,
    private readonly gateway: SaasPaymentGateway,
    private readonly coupons: CouponRedemptionsService,
    private readonly plans: PlanAccessService,
  ) {}

  /** Read-only preview of a plan change (what `changePlan` would charge / block). */
  async preview(institutionId: string, planId: string, cycle: BillingCycle) {
    await this.plans.refreshUsage(institutionId);
    const [plans, inst] = await Promise.all([this.core.plans(), this.core.mustInstitution(this.core.prisma, institutionId)]);
    await this.core.mustPlan(this.core.prisma, planId);
    return planChangePreview(plans, inst, planId, cycle);
  }

  /**
   * Immediate plan / cycle change. Upgrades charge the prorated difference; a cycle switch starts a new period
   * (new price minus unused credit). Downgrades are free and rejected when usage exceeds the target limits.
   * An optional `couponCode` is redeemed for the target plan / cycle and discounts this and later invoices.
   */
  async changePlan(institutionId: string, planId: string, cycle: BillingCycle, actor: SaasActorKind, couponCode?: string): Promise<ChangePlanResult> {
    // Usage limits on the target plan must be checked against real counts.
    await this.plans.refreshUsage(institutionId);
    return this.core.tx(async (tx) => {
      const inst = await this.core.mustInstitution(tx, institutionId);
      const target = await this.core.mustPlan(tx, planId);
      const plans = await this.core.plans(tx);
      const s = inst.subscription;
      if (s.status === "CANCELLED") throw new BadRequestException("Reactivate the subscription before changing plans.");
      if (s.status === "SUSPENDED") throw new BadRequestException("Lift the suspension before changing plans.");
      if (target.archived && target.id !== s.planId) throw new BadRequestException(`${target.name} is archived and can't be assigned.`);
      if (actor === "Institution" && !target.isPublic && target.id !== s.planId)
        throw new BadRequestException(`${target.name} is available through sales only — contact us to switch.`);
      const preview = planChangePreview(plans, inst, planId, cycle);
      if (preview.kind === "SAME") throw new BadRequestException(`Already on ${target.name} (${cycleLabel(cycle)}).`);
      if (preview.blockers.length)
        throw new BadRequestException(
          `Can't move to ${target.name}: usage exceeds its limits — ${preview.blockers
            .map((b) => `${LIMIT_LABEL[b.key]} ${fmtLimitValue(b.usage, b.key)} / ${fmtLimitValue(b.limit, b.key)}`)
            .join(", ")}.`,
        );
      if (target.priceMonthly === 0 && !(planId === s.planId && s.customPrice) && s.status !== "TRIALING")
        throw new BadRequestException(`${target.name} is custom-priced — agree a contract price before switching.`);

      if (couponCode) await this.coupons.redeem(tx, couponCode, { institutionId, planId, cycle, actor });

      const fromName = plans.find((p) => p.id === s.planId)?.name ?? s.planId;
      const kind = preview.kind;
      const now = new Date();
      const keepsCustom = planId === s.planId;
      await tx.institution.update({
        where: { id: institutionId },
        data: {
          planId,
          cycle,
          customPrice: keepsCustom ? s.customPrice : null,
          ...(preview.resetsPeriod ? { currentPeriodStart: now, currentPeriodEnd: periodEndFrom(now, cycle) } : {}),
        },
      });
      const updated = await this.core.mustInstitution(tx, institutionId);

      const typeFor: Record<ChangePlanResult["kind"], SaasEventType> = { UPGRADE: "PLAN_UPGRADED", DOWNGRADE: "PLAN_DOWNGRADED", CYCLE: "CYCLE_CHANGED" };
      const msg =
        kind === "CYCLE"
          ? `Billing cycle changed ${cycleLabel(s.cycle)} → ${cycleLabel(cycle)}`
          : `${kind === "UPGRADE" ? "Upgraded" : "Downgraded"} ${fromName} → ${target.name}${cycle !== s.cycle ? ` (${cycleLabel(cycle)})` : ""}${s.status === "TRIALING" ? " during trial" : ""}`;
      await this.core.event(tx, institutionId, typeFor[kind], msg, actor);

      let invoice: InvoiceView | null = null;
      if (!preview.trialing && preview.dueNow > 0)
        invoice = await this.core.addInvoice(tx, updated, {
          planId,
          cycle,
          amount: preview.dueNow,
          periodStart: preview.resetsPeriod ? new Date(updated.subscription.currentPeriodStart) : now,
          periodEnd: new Date(updated.subscription.currentPeriodEnd),
          paid: !!updated.subscription.paymentMethod,
          discount: await quoteDiscount(tx, institutionId, { planId, cycle, amount: preview.dueNow, at: now }),
          description: preview.resetsPeriod
            ? `${target.name} ${cycleLabel(cycle)} — new period less ${money(preview.credit)} unused credit`
            : `Prorated upgrade ${fromName} → ${target.name}`,
        });
      if (!preview.trialing && kind === "DOWNGRADE" && preview.credit > 0 && !preview.resetsPeriod)
        await this.core.event(tx, institutionId, "NOTE", "Downgrade applied immediately — no refund for the current period", "System");
      return { institution: await this.core.mustInstitution(tx, institutionId), invoice, kind };
    });
  }

  /** `atPeriodEnd` keeps access until the period ends; otherwise cancels now and voids unpaid invoices. */
  async cancel(institutionId: string, atPeriodEnd: boolean, actor: SaasActorKind): Promise<InstitutionView> {
    return this.core.tx(async (tx) => {
      const s = (await this.core.mustInstitution(tx, institutionId)).subscription;
      if (s.status === "CANCELLED") throw new BadRequestException("This subscription is already cancelled.");
      if (actor === "Institution" && s.status === "SUSPENDED") throw new BadRequestException("Your workspace is suspended — contact support.");
      if (atPeriodEnd) {
        if (s.status !== "ACTIVE") throw new BadRequestException("Only active subscriptions can be cancelled at period end.");
        if (s.cancelAtPeriodEnd) throw new BadRequestException("Cancellation is already scheduled.");
        await tx.institution.update({ where: { id: institutionId }, data: { cancelAtPeriodEnd: true } });
        await this.core.event(tx, institutionId, "CANCELLED", `Cancellation scheduled for ${fmtDate(new Date(s.currentPeriodEnd))}`, actor);
      } else {
        const now = new Date();
        await tx.institution.update({
          where: { id: institutionId },
          data: { status: "CANCELLED", cancelAtPeriodEnd: false, cancelledAt: now, currentPeriodEnd: now, statusBeforeSuspend: null },
        });
        await tx.saasInvoice.updateMany({ where: { institutionId, status: { in: ["OPEN", "FAILED"] } }, data: { status: "VOID" } });
        await this.core.event(
          tx,
          institutionId,
          "CANCELLED",
          s.status === "TRIALING" ? "Trial cancelled immediately" : "Subscription cancelled immediately — unpaid invoices voided",
          actor,
        );
      }
      return this.core.mustInstitution(tx, institutionId);
    });
  }

  /** Undoes a scheduled cancellation, or restarts a cancelled subscription with a fresh period + invoice. */
  async reactivate(institutionId: string, actor: SaasActorKind): Promise<InstitutionView> {
    return this.core.tx(async (tx) => {
      const s = (await this.core.mustInstitution(tx, institutionId)).subscription;
      if (s.status === "SUSPENDED") throw new BadRequestException("Lift the suspension instead.");
      if (s.cancelAtPeriodEnd) {
        await tx.institution.update({ where: { id: institutionId }, data: { cancelAtPeriodEnd: false } });
        await this.core.event(tx, institutionId, "REACTIVATED", "Scheduled cancellation removed — subscription will renew", actor);
        return this.core.mustInstitution(tx, institutionId);
      }
      if (s.status !== "CANCELLED") throw new BadRequestException("This subscription is already active.");
      const plan = await this.core.mustPlan(tx, s.planId);
      const now = new Date();
      await tx.institution.update({
        where: { id: institutionId },
        data: { status: "ACTIVE", cancelledAt: null, cancelAtPeriodEnd: false, currentPeriodStart: now, currentPeriodEnd: periodEndFrom(now, s.cycle) },
      });
      const updated = await this.core.mustInstitution(tx, institutionId);
      await this.core.event(tx, institutionId, "REACTIVATED", `Subscription reactivated on ${plan.name} (${cycleLabel(s.cycle)})`, actor);
      const amount = subscriptionPrice(await this.core.plans(tx), updated);
      if (amount > 0)
        await this.core.addInvoice(tx, updated, {
          planId: plan.id,
          cycle: s.cycle,
          amount,
          periodStart: now,
          periodEnd: new Date(updated.subscription.currentPeriodEnd),
          paid: !!updated.subscription.paymentMethod,
          description: `${plan.name} plan — ${cycleLabel(s.cycle)} subscription (reactivation)`,
          discount: await quoteDiscount(tx, institutionId, { planId: plan.id, cycle: s.cycle, amount, at: now }),
        });
      return this.core.mustInstitution(tx, institutionId);
    });
  }

  async suspend(institutionId: string, reason: string): Promise<InstitutionView> {
    return this.core.tx(async (tx) => {
      const s = (await this.core.mustInstitution(tx, institutionId)).subscription;
      if (s.status === "SUSPENDED") throw new BadRequestException("This institution is already suspended.");
      if (s.status === "CANCELLED") throw new BadRequestException("Cancelled institutions can't be suspended.");
      await tx.institution.update({
        where: { id: institutionId },
        data: { status: "SUSPENDED", suspendedAt: new Date(), suspendedReason: reason, statusBeforeSuspend: s.status },
      });
      await this.core.event(tx, institutionId, "SUSPENDED", `Suspended: ${reason}`, "Owner");
      return this.core.mustInstitution(tx, institutionId);
    });
  }

  async unsuspend(institutionId: string): Promise<InstitutionView> {
    return this.core.tx(async (tx) => {
      const s = (await this.core.mustInstitution(tx, institutionId)).subscription;
      if (s.status !== "SUSPENDED") throw new BadRequestException("This institution isn't suspended.");
      const unpaid = await this.core.hasUnpaid(tx, institutionId);
      let restored: SaasSubscriptionStatus = s.statusBeforeSuspend ?? "ACTIVE";
      if (restored === "ACTIVE" && unpaid) restored = "PAST_DUE";
      if (restored === "PAST_DUE" && !unpaid) restored = "ACTIVE";
      if (restored === "TRIALING" && s.trialEndsAt && new Date(s.trialEndsAt).getTime() < Date.now()) restored = "ACTIVE";
      await tx.institution.update({
        where: { id: institutionId },
        data: { status: restored, suspendedAt: null, suspendedReason: null, statusBeforeSuspend: null },
      });
      await this.core.event(tx, institutionId, "REACTIVATED", `Suspension lifted — status ${restored.replace("_", " ").toLowerCase()}`, "Owner");
      return this.core.mustInstitution(tx, institutionId);
    });
  }

  async extendTrial(institutionId: string, days: number): Promise<InstitutionView> {
    return this.core.tx(async (tx) => {
      const s = (await this.core.mustInstitution(tx, institutionId)).subscription;
      if (s.status !== "TRIALING" || !s.trialEndsAt) throw new BadRequestException("Only institutions on a trial can be extended.");
      const base = Math.max(new Date(s.trialEndsAt).getTime(), Date.now());
      const ends = new Date(base + days * DAY_MS);
      await tx.institution.update({ where: { id: institutionId }, data: { trialEndsAt: ends, currentPeriodEnd: ends } });
      await this.core.event(tx, institutionId, "NOTE", `Trial extended by ${days} day${days === 1 ? "" : "s"} — now ends ${fmtDate(ends)}`, "Owner");
      return this.core.mustInstitution(tx, institutionId);
    });
  }

  /** Trial → paid: charges the first period now (less any coupon discount) on the given payment method. */
  async convertTrial(institutionId: string, planId: string, cycle: BillingCycle, pm: PaymentMethodDto, actor: SaasActorKind, couponCode?: string): Promise<InstitutionView> {
    await this.plans.refreshUsage(institutionId);
    return this.core.tx(async (tx) => {
      const inst = await this.core.mustInstitution(tx, institutionId);
      if (inst.subscription.status !== "TRIALING") throw new BadRequestException("This institution isn't on a trial.");
      const plan = await this.core.mustPlan(tx, planId);
      if (plan.archived && plan.id !== inst.subscription.planId) throw new BadRequestException(`${plan.name} is archived and can't be assigned.`);
      const amount = priceFor(plan, cycle);
      if (amount <= 0) throw new BadRequestException(`${plan.name} is custom-priced — convert it with a contract price.`);
      const blockers = planChangePreview(await this.core.plans(tx), inst, planId, cycle).blockers;
      if (blockers.length)
        throw new BadRequestException(`Usage exceeds ${plan.name} limits (${blockers.map((b) => LIMIT_LABEL[b.key]).join(", ")}). Choose a bigger plan.`);
      if (couponCode) await this.coupons.redeem(tx, couponCode, { institutionId, planId, cycle, actor });
      const now = new Date();
      const discount = await quoteDiscount(tx, institutionId, { planId, cycle, amount, at: now });
      const due = round2(amount - (discount?.amount ?? 0));
      const charge = due > 0 ? await this.gateway.charge(pm, due) : { ok: true as const };
      if (!charge.ok) throw new BadRequestException(`${pm.brand} •••• ${pm.last4} was declined. Try another payment method.`);
      await tx.institution.update({
        where: { id: institutionId },
        data: {
          planId,
          cycle,
          status: "ACTIVE",
          startedAt: now,
          currentPeriodStart: now,
          currentPeriodEnd: periodEndFrom(now, cycle),
          paymentBrand: pm.brand,
          paymentLast4: pm.last4,
        },
      });
      const updated = await this.core.mustInstitution(tx, institutionId);
      await this.core.event(tx, institutionId, "TRIAL_CONVERTED", `Trial converted to ${plan.name} (${cycleLabel(cycle)})`, actor);
      await this.core.addInvoice(tx, updated, {
        planId,
        cycle,
        amount,
        periodStart: now,
        periodEnd: new Date(updated.subscription.currentPeriodEnd),
        paid: true,
        description: `${plan.name} plan — ${cycleLabel(cycle)} subscription`,
        discount,
      });
      return this.core.mustInstitution(tx, institutionId);
    });
  }

  async updatePaymentMethod(institutionId: string, pm: PaymentMethodDto, actor: SaasActorKind): Promise<InstitutionView> {
    return this.core.tx(async (tx) => {
      await this.core.mustInstitution(tx, institutionId);
      await tx.institution.update({ where: { id: institutionId }, data: { paymentBrand: pm.brand, paymentLast4: pm.last4 } });
      await this.core.event(tx, institutionId, "NOTE", `Payment method updated to ${pm.brand} •••• ${pm.last4}`, actor);
      return this.core.mustInstitution(tx, institutionId);
    });
  }
}
