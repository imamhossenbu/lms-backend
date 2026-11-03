import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { priceFor, round2 } from "../../saas.math";
import type { BillingCycle, InstitutionView, SaasActorKind } from "../../saas.types";
import { SaasCoreService, type Tx } from "../../services/saas-core.service";
import { couponTerms, toRedemptionView } from "../coupon.mapper";
import { couponSummary, discountOn, isRunning, redemptionError } from "../coupon.rules";
import { COUPON_ERRORS, normalizeCode } from "../coupons.constants";
import type { CouponCheckResult, CouponRedemptionView } from "../coupons.types";

interface RedeemTarget {
  institutionId: string;
  planId: string;
  cycle: BillingCycle;
  actor: SaasActorKind;
}

/**
 * Redeeming platform coupons: public code check (signup page), redemption inside the signup / checkout /
 * plan-change transactions, and the owner's apply / remove on an institution. Limits enforced here:
 * active, expiry, max redemptions (coupon row locked), plan + cycle restriction, once per institution,
 * new customers only, one running discount per subscription.
 */
@Injectable()
export class CouponRedemptionsService {
  constructor(private readonly core: SaasCoreService) {}

  /** Anonymous preview: is the code valid for this plan / cycle, and what does the first invoice cost? */
  async check(code: string, planId: string, cycle: BillingCycle): Promise<CouponCheckResult> {
    const plan = await this.core.mustPlan(this.core.prisma, planId);
    const coupon = await this.core.prisma.saasCoupon.findUnique({ where: { code: normalizeCode(code) }, include: { _count: { select: { redemptions: true } } } });
    if (!coupon) throw new BadRequestException(COUPON_ERRORS.notFound);
    const error = redemptionError({ ...coupon, ...couponTerms(coupon) }, { planId, planName: plan.name, cycle, redemptionCount: coupon._count.redemptions });
    if (error) throw new BadRequestException(error);
    const terms = couponTerms(coupon);
    const price = priceFor(plan, cycle);
    const amountOff = discountOn(terms, price);
    return {
      code: coupon.code,
      description: coupon.description,
      type: terms.type,
      value: terms.value,
      duration: terms.duration,
      durationMonths: terms.durationMonths,
      summary: couponSummary(terms),
      price,
      amountOff,
      priceAfterDiscount: round2(price - amountOff),
    };
  }

  /** Records a redemption inside the caller's transaction; throws a friendly 400 when a limit blocks it. */
  async redeem(tx: Tx, rawCode: string, target: RedeemTarget): Promise<CouponRedemptionView> {
    const code = normalizeCode(rawCode);
    // Lock the coupon row so concurrent redemptions can't exceed maxRedemptions.
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "saas_coupons" WHERE "code" = ${code} FOR UPDATE`;
    if (!locked.length) throw new BadRequestException(COUPON_ERRORS.notFound);
    const coupon = await tx.saasCoupon.findUniqueOrThrow({ where: { id: locked[0]!.id } });
    const plan = await this.core.mustPlan(tx, target.planId);
    const [redemptionCount, mine, hasPaid] = await Promise.all([
      tx.saasCouponRedemption.count({ where: { couponId: coupon.id } }),
      tx.saasCouponRedemption.findMany({ where: { institutionId: target.institutionId }, select: { couponId: true, endedAt: true, discountEndsAt: true } }),
      tx.saasInvoice.count({ where: { institutionId: target.institutionId, status: "PAID", total: { gt: 0 } } }).then((n) => n > 0),
    ]);
    const error = redemptionError(
      { ...coupon, ...couponTerms(coupon) },
      {
        planId: plan.id,
        planName: plan.name,
        cycle: target.cycle,
        redemptionCount,
        institution: { alreadyRedeemed: mine.some((r) => r.couponId === coupon.id), hasPaid, hasRunningDiscount: mine.some((r) => isRunning(r)) },
      },
    );
    if (error) throw new BadRequestException(error);

    const row = await tx.saasCouponRedemption.create({
      data: { couponId: coupon.id, institutionId: target.institutionId, planId: plan.id, cycle: target.cycle },
    });
    await this.core.event(tx, target.institutionId, "NOTE", `Coupon ${coupon.code} applied — ${couponSummary(couponTerms(coupon))}`, target.actor);
    return toRedemptionView(row);
  }

  /** Owner Console: apply a code to an institution's current plan / cycle (discounts its next invoices). */
  async applyToInstitution(institutionId: string, code: string): Promise<{ institution: InstitutionView; redemption: CouponRedemptionView }> {
    return this.core.tx(async (tx) => {
      const inst = await this.core.mustInstitution(tx, institutionId);
      if (inst.subscription.status === "CANCELLED") throw new BadRequestException("Reactivate the subscription before applying a coupon.");
      const redemption = await this.redeem(tx, code, { institutionId, planId: inst.subscription.planId, cycle: inst.subscription.cycle, actor: "Owner" });
      return { institution: inst, redemption };
    });
  }

  /** Owner Console: stop the running discount (history and past invoices are kept). */
  async removeFromInstitution(institutionId: string): Promise<{ ended: number }> {
    return this.core.tx(async (tx) => {
      await this.core.mustInstitution(tx, institutionId);
      const rows = await tx.saasCouponRedemption.findMany({ where: { institutionId, endedAt: null }, include: { coupon: { select: { code: true } } } });
      const running = rows.filter((r) => isRunning(r));
      if (!running.length) throw new NotFoundException("No discount is running on this subscription.");
      await tx.saasCouponRedemption.updateMany({ where: { id: { in: running.map((r) => r.id) } }, data: { endedAt: new Date() } });
      await this.core.event(tx, institutionId, "NOTE", `Coupon ${running.map((r) => r.coupon.code).join(", ")} removed`, "Owner");
      return { ended: running.length };
    });
  }
}
