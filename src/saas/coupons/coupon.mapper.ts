import type { SaasCoupon, SaasCouponRedemption } from "../../../generated/prisma";
import { couponStatus } from "./coupon.rules";
import type { CouponRedemptionView, CouponTerms, CouponView } from "./coupons.types";

/** Prisma rows → console Coupon shape. */

const num = (d: { toNumber(): number } | number) => (typeof d === "number" ? d : d.toNumber());

export const toRedemptionView = (r: SaasCouponRedemption): CouponRedemptionView => ({
  id: r.id,
  institutionId: r.institutionId,
  planId: r.planId,
  at: r.at.toISOString(),
  amountOff: num(r.amountOff),
});

export const couponTerms = (c: SaasCoupon): CouponTerms => ({
  type: c.type,
  value: num(c.value),
  duration: c.duration,
  durationMonths: c.durationMonths,
  planIds: c.planIds,
  cycle: c.cycle,
});

export function toCouponView(c: SaasCoupon & { redemptions: SaasCouponRedemption[] }, now = Date.now()): CouponView {
  return {
    id: c.id,
    code: c.code,
    description: c.description,
    ...couponTerms(c),
    maxRedemptions: c.maxRedemptions,
    expiresAt: c.expiresAt ? c.expiresAt.toISOString() : null,
    newCustomersOnly: c.newCustomersOnly,
    active: c.active,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    redemptions: [...c.redemptions].sort((a, b) => b.at.getTime() - a.at.getTime()).map(toRedemptionView),
    status: couponStatus(c, c.redemptions.length, now),
  };
}
