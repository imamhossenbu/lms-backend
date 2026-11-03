import type { BillingCycle } from "../saas.types";
import type { CouponCycle, CouponDuration, CouponStatus, CouponType } from "./coupons.constants";

/** API shapes — identical to the console's src/types/coupon.ts (plus the derived `status`). Money is USD. */

export interface CouponRedemptionView {
  id: string;
  institutionId: string;
  planId: string;
  at: string;
  /** Total discount granted to this institution so far (USD). */
  amountOff: number;
}

export interface CouponView {
  id: string;
  code: string;
  description: string;
  type: CouponType;
  value: number;
  duration: CouponDuration;
  durationMonths: number | null;
  planIds: string[];
  cycle: CouponCycle;
  maxRedemptions: number | null;
  expiresAt: string | null;
  newCustomersOnly: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  redemptions: CouponRedemptionView[];
  /** Derived server-side (same rule as the console's couponStatus()). */
  status: CouponStatus;
}

/** Coupons page KPI cards. */
export interface CouponStats {
  total: number;
  active: number;
  redemptions: number;
  redemptionsLast30Days: number;
  discountGiven: number;
  avgDiscountPerRedemption: number;
  expiringIn7Days: number;
}

/** Fields the pure rules need from a coupon row. */
export interface CouponTerms {
  type: CouponType;
  value: number;
  duration: CouponDuration;
  durationMonths: number | null;
  planIds: string[];
  cycle: CouponCycle;
}

export interface CouponLimits {
  active: boolean;
  expiresAt: Date | string | null;
  maxRedemptions: number | null;
  newCustomersOnly: boolean;
}

/** Running-state of one redemption. */
export interface RedemptionState {
  invoicesApplied: number;
  discountEndsAt: Date | null;
  endedAt: Date | null;
}

/** A discount priced onto one invoice line. */
export interface AppliedDiscount {
  redemptionId: string;
  code: string;
  amount: number;
}

/** One invoice line the discount is computed against (pre-tax amount). */
export interface InvoiceLine {
  planId: string;
  cycle: BillingCycle;
  amount: number;
  at: Date;
}

/** Public / checkout preview of a code. */
export interface CouponCheckResult {
  code: string;
  description: string;
  type: CouponType;
  value: number;
  duration: CouponDuration;
  durationMonths: number | null;
  summary: string;
  /** Plan price per cycle, discount on the first invoice and what's left (pre-tax). */
  price: number;
  amountOff: number;
  priceAfterDiscount: number;
}
