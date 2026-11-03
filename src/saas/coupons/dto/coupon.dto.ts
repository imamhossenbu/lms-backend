import { Transform } from "class-transformer";
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsPositive, IsString, Matches, Max, MaxLength, Min, MinLength } from "class-validator";
import { PaginationQueryDto } from "../../../common/pagination";
import { IsCycle, IsPlanId, Trim } from "../../dto/common";
import {
  COUPON_CODE_REGEX,
  COUPON_CYCLES,
  COUPON_DESCRIPTION_MAX,
  COUPON_DURATIONS,
  COUPON_STATUSES,
  COUPON_TYPES,
  MAX_DURATION_MONTHS,
  MAX_REDEMPTIONS_CAP,
  normalizeCode,
  type CouponCycle,
  type CouponDuration,
  type CouponStatus,
  type CouponType,
} from "../coupons.constants";
import type { CouponFormValues } from "../coupon.rules";

/** Upper-cases and strips whitespace (the console's normalizeCode transform). */
const NormalizeCode = () => Transform(({ value }) => (typeof value === "string" ? normalizeCode(value) : value));

/**
 * Coupon create / edit — the console's CouponFormValues, field messages copied from couponFormSchema.
 * Cross-field rules (percent ≤ 100, whole percent, fixed cap, expiry date) live in coupon.rules.ts › couponFormErrors.
 */
export class CouponFormDto implements CouponFormValues {
  @NormalizeCode()
  @IsString({ message: "Use at least 3 characters." })
  @MinLength(3, { message: "Use at least 3 characters." })
  @MaxLength(24, { message: "Keep it to 24 characters or fewer." })
  @Matches(COUPON_CODE_REGEX, { message: "Letters, numbers, - and _ only." })
  code!: string;

  @Trim()
  @IsString()
  @MaxLength(COUPON_DESCRIPTION_MAX, { message: `Keep it under ${COUPON_DESCRIPTION_MAX} characters.` })
  description: string = "";

  @IsIn(COUPON_TYPES, { message: "Choose a discount type." }) type!: CouponType;

  @IsNumber({ allowNaN: false, allowInfinity: false }, { message: "Enter a discount." })
  @IsPositive({ message: "Enter a discount above 0." })
  value!: number;

  @IsIn(COUPON_DURATIONS, { message: "Choose how long the discount lasts." }) duration!: CouponDuration;

  @IsNumber({}, { message: "Enter the number of months." })
  @IsInt({ message: "Whole months only." })
  @Min(1, { message: "At least 1 month." })
  @Max(MAX_DURATION_MONTHS, { message: `${MAX_DURATION_MONTHS} months at most.` })
  durationMonths: number = 3;

  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  planIds: string[] = [];

  @IsIn(COUPON_CYCLES, { message: "Choose a billing cycle." }) cycle: CouponCycle = "ANY";

  @IsBoolean() limitRedemptions!: boolean;

  @IsNumber({}, { message: "Enter a limit." })
  @IsInt({ message: "Whole numbers only." })
  @Min(1, { message: "At least 1." })
  @Max(MAX_REDEMPTIONS_CAP, { message: "That's too many." })
  maxRedemptions: number = 100;

  @IsBoolean() hasExpiry!: boolean;
  @IsString() @MaxLength(10) expiresOn: string = "";
  @IsBoolean() newCustomersOnly: boolean = false;
  @IsBoolean() active: boolean = true;
}

export class SetCouponActiveDto {
  @IsBoolean({ message: "active must be true or false" }) active!: boolean;
}

/** GET /saas/owner/coupons — `?q`, `?status`, `?type` + pagination (same filters as the Coupons page). */
export class ListCouponsQueryDto extends PaginationQueryDto {
  @IsOptional() @Trim() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsIn(COUPON_STATUSES, { message: `status must be one of ${COUPON_STATUSES.join(", ")}` }) status?: CouponStatus;
  @IsOptional() @IsIn(COUPON_TYPES, { message: "type must be PERCENT or FIXED" }) type?: CouponType;
}

/** Optional coupon code on signup / checkout / plan change. Empty string = none. */
export const IsOptionalCouponCode = () => (target: object, key: string | symbol) => {
  Transform(({ value }) => (typeof value === "string" ? normalizeCode(value) || undefined : value))(target, key);
  IsOptional()(target, key);
  IsString({ message: "Enter a coupon code." })(target, key);
  MaxLength(24, { message: "This coupon code isn't valid." })(target, key);
};

/** Public "check this code" (signup page) and the institution checkout preview. */
export class CheckCouponDto {
  @NormalizeCode()
  @IsString({ message: "Enter a coupon code." })
  @MinLength(1, { message: "Enter a coupon code." })
  @MaxLength(24, { message: "This coupon code isn't valid." })
  code!: string;

  @IsPlanId() planId!: string;
  @IsCycle() cycle!: "MONTHLY" | "YEARLY";
}

/** Owner applies a coupon to an institution's subscription. */
export class ApplyCouponDto {
  @NormalizeCode()
  @IsString({ message: "Enter a coupon code." })
  @MinLength(1, { message: "Enter a coupon code." })
  @MaxLength(24, { message: "This coupon code isn't valid." })
  code!: string;
}
