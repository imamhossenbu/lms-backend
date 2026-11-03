/**
 * Platform (SaaS subscription) coupons — kept in sync with the Owner Console contract
 * (lms-owner-console: src/types/coupon.ts + src/validations/couponSchema.ts).
 */

export const COUPON_TYPES = ["PERCENT", "FIXED"] as const;
export type CouponType = (typeof COUPON_TYPES)[number];

/** ONCE = first invoice only · REPEATING = the first `durationMonths` months · FOREVER = every invoice. */
export const COUPON_DURATIONS = ["ONCE", "REPEATING", "FOREVER"] as const;
export type CouponDuration = (typeof COUPON_DURATIONS)[number];

export const COUPON_CYCLES = ["ANY", "MONTHLY", "YEARLY"] as const;
export type CouponCycle = (typeof COUPON_CYCLES)[number];

/** Derived — see `couponStatus()` in coupon.rules.ts. */
export const COUPON_STATUSES = ["ACTIVE", "EXPIRED", "EXHAUSTED", "DISABLED"] as const;
export type CouponStatus = (typeof COUPON_STATUSES)[number];

export const COUPON_CODE_REGEX = /^[A-Z0-9][A-Z0-9_-]{2,23}$/;
export const COUPON_DESCRIPTION_MAX = 120;
export const MAX_FIXED_OFF = 10_000;
export const MAX_DURATION_MONTHS = 36;
export const MAX_REDEMPTIONS_CAP = 100_000;
/** "Expiring soon" window of the KPI card. */
export const EXPIRING_SOON_DAYS = 7;

export const normalizeCode = (v: string) => v.trim().toUpperCase().replace(/\s+/g, "");

/** Friendly redemption errors (signup / checkout / owner "apply coupon"). */
export const COUPON_ERRORS = {
  notFound: "This coupon code isn't valid.",
  disabled: "This coupon is no longer active.",
  expired: "This coupon has expired.",
  exhausted: "This coupon has reached its redemption limit.",
  newCustomersOnly: "This coupon is for new customers only.",
  alreadyRedeemed: "This coupon has already been used on this workspace.",
  runningDiscount: "A discount is already applied to this subscription.",
  yearlyOnly: "This coupon only applies to yearly billing.",
  monthlyOnly: "This coupon only applies to monthly billing.",
} as const;
