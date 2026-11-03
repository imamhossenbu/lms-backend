import { addMonthsUtc, DAY_MS, round2 } from "../saas.math";
import type { BillingCycle } from "../saas.types";
import { COUPON_ERRORS, EXPIRING_SOON_DAYS, MAX_FIXED_OFF, type CouponStatus } from "./coupons.constants";
import type { CouponLimits, CouponStats, CouponTerms, CouponView, InvoiceLine, RedemptionState } from "./coupons.types";

/** Pure coupon logic: derived status, redemption eligibility, per-invoice discount math and KPI stats. */

const time = (d: Date | string) => (typeof d === "string" ? new Date(d) : d).getTime();

// ---------------------------------------------------------------- status

/** DISABLED (owner switch) › EXPIRED (past expiry) › EXHAUSTED (max reached) › ACTIVE — same order as the console. */
export function couponStatus(c: Pick<CouponLimits, "active" | "expiresAt" | "maxRedemptions">, redemptionCount: number, now = Date.now()): CouponStatus {
  if (!c.active) return "DISABLED";
  if (c.expiresAt && time(c.expiresAt) < now) return "EXPIRED";
  if (c.maxRedemptions !== null && redemptionCount >= c.maxRedemptions) return "EXHAUSTED";
  return "ACTIVE";
}

// ---------------------------------------------------------------- form (the console's superRefine)

export interface CouponFormValues {
  code: string;
  description: string;
  type: CouponTerms["type"];
  value: number;
  duration: CouponTerms["duration"];
  durationMonths: number;
  planIds: string[];
  cycle: CouponTerms["cycle"];
  limitRedemptions: boolean;
  maxRedemptions: number;
  hasExpiry: boolean;
  expiresOn: string;
  newCustomersOnly: boolean;
  active: boolean;
}

/** Cross-field rules, messages copied from couponFormSchema.superRefine. */
export function couponFormErrors(v: Pick<CouponFormValues, "type" | "value" | "hasExpiry" | "expiresOn">): string[] {
  const errors: string[] = [];
  if (v.type === "PERCENT" && v.value > 100) errors.push("A percentage can't be more than 100.");
  if (v.type === "PERCENT" && !Number.isInteger(v.value)) errors.push("Use a whole percentage.");
  if (v.type === "FIXED" && v.value > MAX_FIXED_OFF) errors.push(`At most $${MAX_FIXED_OFF.toLocaleString("en-US")}.`);
  if (v.type === "FIXED" && Math.abs(Math.round(v.value * 100) - v.value * 100) > 1e-6) errors.push("Use at most 2 decimals.");
  if (v.hasExpiry && (!/^\d{4}-\d{2}-\d{2}$/.test(v.expiresOn) || Number.isNaN(Date.parse(`${v.expiresOn}T23:59:59.000Z`))))
    errors.push("Pick the last day it can be used.");
  return errors;
}

/** Form values → stored fields (switch + value pairs collapse to null, expiry = end of that day UTC). */
export function couponDataFromForm(v: CouponFormValues) {
  return {
    code: v.code,
    description: v.description,
    type: v.type,
    value: v.value,
    duration: v.duration,
    durationMonths: v.duration === "REPEATING" ? v.durationMonths : null,
    planIds: [...new Set(v.planIds)],
    cycle: v.cycle,
    maxRedemptions: v.limitRedemptions ? v.maxRedemptions : null,
    expiresAt: v.hasExpiry ? new Date(`${v.expiresOn}T23:59:59.000Z`) : null,
    newCustomersOnly: v.newCustomersOnly,
    active: v.active,
  };
}

// ---------------------------------------------------------------- redemption eligibility

export interface RedemptionContext {
  planId: string;
  planName: string;
  cycle: BillingCycle;
  redemptionCount: number;
  now?: number;
  /** Omitted for the anonymous signup preview (a brand-new workspace passes every per-institution rule). */
  institution?: { alreadyRedeemed: boolean; hasPaid: boolean; hasRunningDiscount: boolean };
}

/** null when the coupon can be redeemed for this plan / cycle / institution, otherwise a friendly message. */
export function redemptionError(c: CouponLimits & Pick<CouponTerms, "planIds" | "cycle">, ctx: RedemptionContext): string | null {
  const status = couponStatus(c, ctx.redemptionCount, ctx.now);
  if (status === "DISABLED") return COUPON_ERRORS.disabled;
  if (status === "EXPIRED") return COUPON_ERRORS.expired;
  if (status === "EXHAUSTED") return COUPON_ERRORS.exhausted;
  if (c.planIds.length && !c.planIds.includes(ctx.planId)) return `This coupon doesn't apply to the ${ctx.planName} plan.`;
  if (c.cycle !== "ANY" && c.cycle !== ctx.cycle) return c.cycle === "YEARLY" ? COUPON_ERRORS.yearlyOnly : COUPON_ERRORS.monthlyOnly;
  const inst = ctx.institution;
  if (inst?.alreadyRedeemed) return COUPON_ERRORS.alreadyRedeemed;
  if (inst && c.newCustomersOnly && inst.hasPaid) return COUPON_ERRORS.newCustomersOnly;
  if (inst?.hasRunningDiscount) return COUPON_ERRORS.runningDiscount;
  return null;
}

// ---------------------------------------------------------------- invoice discount

/** Still discounting future invoices? (not ended, REPEATING window not over). */
export const isRunning = (r: Pick<RedemptionState, "discountEndsAt" | "endedAt">, now = Date.now()) =>
  !r.endedAt && (!r.discountEndsAt || r.discountEndsAt.getTime() > now);

/** Raw discount for an amount (percent rounded to cents; fixed capped at the amount). */
export const discountOn = (t: Pick<CouponTerms, "type" | "value">, amount: number) =>
  amount <= 0 ? 0 : t.type === "PERCENT" ? Math.min(amount, round2((amount * t.value) / 100)) : round2(Math.min(t.value, amount));

/**
 * Discount on one invoice line, 0 when it doesn't apply: ended / used up, outside the REPEATING window,
 * or the line's plan / cycle isn't covered by the coupon (the discount pauses until it is again).
 */
export function invoiceDiscount(t: CouponTerms, r: RedemptionState, line: InvoiceLine): number {
  if (r.endedAt || line.amount <= 0) return 0;
  if (t.planIds.length && !t.planIds.includes(line.planId)) return 0;
  if (t.cycle !== "ANY" && t.cycle !== line.cycle) return 0;
  if (t.duration === "ONCE" && r.invoicesApplied >= 1) return 0;
  if (t.duration === "REPEATING" && r.discountEndsAt && line.at.getTime() >= r.discountEndsAt.getTime()) return 0;
  return discountOn(t, line.amount);
}

/** Redemption update after a discounted invoice: ONCE ends now, REPEATING starts its window on first use. */
export function usageUpdate(t: Pick<CouponTerms, "duration" | "durationMonths">, r: RedemptionState, at: Date, amount: number) {
  return {
    invoicesApplied: r.invoicesApplied + 1,
    amountOffIncrement: round2(amount),
    endedAt: t.duration === "ONCE" ? at : r.endedAt,
    discountEndsAt: t.duration === "REPEATING" && !r.discountEndsAt ? addMonthsUtc(at, t.durationMonths ?? 1) : r.discountEndsAt,
  };
}

// ---------------------------------------------------------------- labels

export const couponMoney = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
export const discountLabel = (t: Pick<CouponTerms, "type" | "value">) => (t.type === "PERCENT" ? `${t.value}% off` : `${couponMoney(t.value)} off`);
export const durationLabel = (t: Pick<CouponTerms, "duration" | "durationMonths">) =>
  t.duration === "ONCE" ? "first invoice" : t.duration === "FOREVER" ? "forever" : `for ${t.durationMonths} month${t.durationMonths === 1 ? "" : "s"}`;
/** "20% off for 3 months". */
export const couponSummary = (t: Pick<CouponTerms, "type" | "value" | "duration" | "durationMonths">) => `${discountLabel(t)} ${durationLabel(t)}`;

// ---------------------------------------------------------------- stats

/** Coupons page KPIs (same maths as the console's CouponKpis). */
export function couponStats(coupons: Pick<CouponView, "status" | "expiresAt" | "redemptions">[], now = Date.now()): CouponStats {
  const active = coupons.filter((c) => c.status === "ACTIVE");
  const redemptions = coupons.flatMap((c) => c.redemptions);
  const given = round2(redemptions.reduce((s, r) => s + r.amountOff, 0));
  return {
    total: coupons.length,
    active: active.length,
    redemptions: redemptions.length,
    redemptionsLast30Days: redemptions.filter((r) => now - time(r.at) <= 30 * DAY_MS).length,
    discountGiven: given,
    avgDiscountPerRedemption: redemptions.length ? round2(given / redemptions.length) : 0,
    expiringIn7Days: active.filter((c) => c.expiresAt && Math.ceil((time(c.expiresAt) - now) / DAY_MS) <= EXPIRING_SOON_DAYS).length,
  };
}
