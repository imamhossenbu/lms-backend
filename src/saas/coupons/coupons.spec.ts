import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { SignupDto } from "../dto/signup.dto";
import { couponDataFromForm, couponFormErrors, couponStats, couponStatus, couponSummary, discountOn, invoiceDiscount, isRunning, redemptionError, usageUpdate } from "./coupon.rules";
import type { CouponTerms, RedemptionState } from "./coupons.types";
import { CouponFormDto, ListCouponsQueryDto } from "./dto/coupon.dto";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 3, 12);

const form = (over: Record<string, unknown> = {}) => ({
  code: "launch20",
  description: "Launch offer",
  type: "PERCENT",
  value: 20,
  duration: "ONCE",
  durationMonths: 3,
  planIds: [],
  cycle: "ANY",
  limitRedemptions: false,
  maxRedemptions: 100,
  hasExpiry: false,
  expiresOn: "",
  newCustomersOnly: false,
  active: true,
  ...over,
});

const messages = (cls: new () => object, body: object) =>
  validateSync(plainToInstance(cls, body) as object, { whitelist: true }).flatMap((e) => Object.values(e.constraints ?? {}));

describe("CouponFormDto (console couponFormSchema messages)", () => {
  it("normalises the code and accepts a valid form", () => {
    const dto = plainToInstance(CouponFormDto, form({ code: " launch 20 " }));
    expect(validateSync(dto)).toHaveLength(0);
    expect(dto.code).toBe("LAUNCH20");
  });

  it("copies the console's field messages", () => {
    expect(messages(CouponFormDto, form({ code: "ab" }))).toContain("Use at least 3 characters.");
    expect(messages(CouponFormDto, form({ code: "A".repeat(25) }))).toContain("Keep it to 24 characters or fewer.");
    expect(messages(CouponFormDto, form({ code: "AB$C" }))).toContain("Letters, numbers, - and _ only.");
    expect(messages(CouponFormDto, form({ value: 0 }))).toContain("Enter a discount above 0.");
    expect(messages(CouponFormDto, form({ value: "x" }))).toContain("Enter a discount.");
    expect(messages(CouponFormDto, form({ durationMonths: 40 }))).toContain("36 months at most.");
    expect(messages(CouponFormDto, form({ maxRedemptions: 0 }))).toContain("At least 1.");
    expect(messages(CouponFormDto, form({ description: "x".repeat(121) }))).toContain("Keep it under 120 characters.");
  });

  it("list query rejects unknown status", () => {
    expect(messages(ListCouponsQueryDto, { status: "NOPE" })[0]).toMatch(/status must be one of/);
  });

  it("signup accepts an optional coupon code ('' = none)", () => {
    const base = { name: "Ann Lee", email: "a@b.co", password: "secret123", institutionName: "Ann School", type: "SCHOOL", country: "Bangladesh", slug: "ann-school", planId: "starter", cycle: "MONTHLY", agreeTerms: true };
    const withCode = plainToInstance(SignupDto, { ...base, couponCode: " launch20 " });
    const empty = plainToInstance(SignupDto, { ...base, couponCode: "" });
    expect(validateSync(withCode)).toHaveLength(0);
    expect(withCode.couponCode).toBe("LAUNCH20");
    expect(validateSync(empty)).toHaveLength(0);
    expect(empty.couponCode).toBeUndefined();
  });
});

describe("couponFormErrors (superRefine)", () => {
  it("enforces percent / fixed / expiry rules", () => {
    expect(couponFormErrors({ type: "PERCENT", value: 120, hasExpiry: false, expiresOn: "" })).toContain("A percentage can't be more than 100.");
    expect(couponFormErrors({ type: "PERCENT", value: 12.5, hasExpiry: false, expiresOn: "" })).toContain("Use a whole percentage.");
    expect(couponFormErrors({ type: "FIXED", value: 10_001, hasExpiry: false, expiresOn: "" })).toContain("At most $10,000.");
    expect(couponFormErrors({ type: "FIXED", value: 9.99, hasExpiry: false, expiresOn: "" })).toEqual([]);
    expect(couponFormErrors({ type: "FIXED", value: 10, hasExpiry: true, expiresOn: "soon" })).toContain("Pick the last day it can be used.");
  });

  it("converts switches to nulls and expiry to end of day UTC", () => {
    const d = couponDataFromForm({ ...(form() as any), code: "X20", duration: "REPEATING", limitRedemptions: true, maxRedemptions: 5, hasExpiry: true, expiresOn: "2026-12-31" });
    expect(d.durationMonths).toBe(3);
    expect(d.maxRedemptions).toBe(5);
    expect(d.expiresAt?.toISOString()).toBe("2026-12-31T23:59:59.000Z");
    const once = couponDataFromForm(form() as any);
    expect(once.durationMonths).toBeNull();
    expect(once.maxRedemptions).toBeNull();
    expect(once.expiresAt).toBeNull();
  });
});

describe("couponStatus / redemptionError", () => {
  const coupon = { active: true, expiresAt: null as Date | null, maxRedemptions: 2 as number | null, newCustomersOnly: true, planIds: ["growth"], cycle: "YEARLY" as const };
  const ctx = { planId: "growth", planName: "Growth", cycle: "YEARLY" as const, redemptionCount: 0, now: NOW };

  it("derives status in the console's order", () => {
    expect(couponStatus({ ...coupon, active: false }, 5, NOW)).toBe("DISABLED");
    expect(couponStatus({ ...coupon, expiresAt: new Date(NOW - DAY) }, 0, NOW)).toBe("EXPIRED");
    expect(couponStatus(coupon, 2, NOW)).toBe("EXHAUSTED");
    expect(couponStatus(coupon, 1, NOW)).toBe("ACTIVE");
  });

  it("blocks redemption with friendly messages", () => {
    expect(redemptionError(coupon, ctx)).toBeNull();
    expect(redemptionError({ ...coupon, active: false }, ctx)).toBe("This coupon is no longer active.");
    expect(redemptionError(coupon, { ...ctx, redemptionCount: 2 })).toBe("This coupon has reached its redemption limit.");
    expect(redemptionError(coupon, { ...ctx, planId: "starter", planName: "Starter" })).toBe("This coupon doesn't apply to the Starter plan.");
    expect(redemptionError(coupon, { ...ctx, cycle: "MONTHLY" })).toBe("This coupon only applies to yearly billing.");
    const inst = { alreadyRedeemed: false, hasPaid: false, hasRunningDiscount: false };
    expect(redemptionError(coupon, { ...ctx, institution: { ...inst, alreadyRedeemed: true } })).toBe("This coupon has already been used on this workspace.");
    expect(redemptionError(coupon, { ...ctx, institution: { ...inst, hasPaid: true } })).toBe("This coupon is for new customers only.");
    expect(redemptionError(coupon, { ...ctx, institution: { ...inst, hasRunningDiscount: true } })).toBe("A discount is already applied to this subscription.");
  });
});

describe("invoice discount math", () => {
  const terms = (over: Partial<CouponTerms> = {}): CouponTerms => ({ type: "PERCENT", value: 20, duration: "ONCE", durationMonths: null, planIds: [], cycle: "ANY", ...over });
  const fresh: RedemptionState = { invoicesApplied: 0, discountEndsAt: null, endedAt: null };
  const line = { planId: "growth", cycle: "MONTHLY" as const, amount: 79, at: new Date(NOW) };

  it("percent rounds to cents, fixed is capped at the amount", () => {
    expect(discountOn({ type: "PERCENT", value: 15 }, 79)).toBe(11.85);
    expect(discountOn({ type: "FIXED", value: 100 }, 29)).toBe(29);
    expect(discountOn({ type: "PERCENT", value: 100 }, 29)).toBe(29);
  });

  it("ONCE discounts only the first invoice", () => {
    expect(invoiceDiscount(terms(), fresh, line)).toBe(15.8);
    const after = usageUpdate(terms(), fresh, line.at, 15.8);
    expect(after.endedAt).toEqual(line.at);
    expect(invoiceDiscount(terms(), { ...fresh, ...after }, line)).toBe(0);
  });

  it("REPEATING opens its window on first use and stops after durationMonths", () => {
    const t = terms({ duration: "REPEATING", durationMonths: 3 });
    const after = usageUpdate(t, fresh, line.at, 15.8);
    expect(after.discountEndsAt?.toISOString()).toBe("2027-02-03T12:00:00.000Z");
    const state = { ...fresh, ...after };
    expect(invoiceDiscount(t, state, { ...line, at: new Date(NOW + 60 * DAY) })).toBe(15.8);
    expect(invoiceDiscount(t, state, { ...line, at: new Date(NOW + 100 * DAY) })).toBe(0);
    expect(isRunning(state, NOW + 60 * DAY)).toBe(true);
    expect(isRunning(state, NOW + 100 * DAY)).toBe(false);
  });

  it("FOREVER keeps going; plan / cycle restrictions pause it", () => {
    const t = terms({ duration: "FOREVER", type: "FIXED", value: 10, planIds: ["growth"], cycle: "MONTHLY" });
    expect(invoiceDiscount(t, { ...fresh, invoicesApplied: 12 }, line)).toBe(10);
    expect(invoiceDiscount(t, fresh, { ...line, planId: "pro" })).toBe(0);
    expect(invoiceDiscount(t, fresh, { ...line, cycle: "YEARLY" })).toBe(0);
    expect(invoiceDiscount(t, { ...fresh, endedAt: new Date(NOW) }, line)).toBe(0);
    expect(invoiceDiscount(t, fresh, { ...line, amount: 0 })).toBe(0);
  });

  it("summarises like the console", () => {
    expect(couponSummary(terms({ duration: "REPEATING", durationMonths: 3 }))).toBe("20% off for 3 months");
    expect(couponSummary(terms({ type: "FIXED", value: 50, duration: "FOREVER" }))).toBe("$50 off forever");
  });
});

describe("couponStats", () => {
  it("matches the KPI cards", () => {
    const s = couponStats(
      [
        { status: "ACTIVE", expiresAt: new Date(NOW + 3 * DAY).toISOString(), redemptions: [{ id: "a", institutionId: "i", planId: "pro", at: new Date(NOW - DAY).toISOString(), amountOff: 30 }] },
        { status: "DISABLED", expiresAt: null, redemptions: [{ id: "b", institutionId: "j", planId: "pro", at: new Date(NOW - 40 * DAY).toISOString(), amountOff: 10 }] },
        { status: "ACTIVE", expiresAt: null, redemptions: [] },
      ],
      NOW,
    );
    expect(s).toEqual({ total: 3, active: 2, redemptions: 2, redemptionsLast30Days: 1, discountGiven: 40, avgDiscountPerRedemption: 20, expiringIn7Days: 1 });
  });
});
