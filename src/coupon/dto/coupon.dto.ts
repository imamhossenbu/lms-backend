import { PartialType } from "@nestjs/mapped-types";
import { Transform, Type } from "class-transformer";
import { IsDate, IsIn, IsInt, IsNumber, IsUUID, Matches, Max, MaxLength, Min, MinLength } from "class-validator";

export const COUPON_TYPES = ["PERCENTAGE", "FIXED"] as const;
export const COUPON_STATUSES = ["ACTIVE", "INACTIVE"] as const;

/** Course coupon (legacy /coupon). Codes are stored upper-case and unique per workspace. */
export class CreateCouponDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toUpperCase() : value))
  @MinLength(3, { message: "Coupon code must be at least 3 characters" })
  @MaxLength(20, { message: "Coupon code cannot exceed 20 characters" })
  @Matches(/^[A-Z0-9_-]+$/, { message: "Use letters, numbers, dashes or underscores only" })
  code!: string;

  @IsIn(COUPON_TYPES, { message: "discountType must be PERCENTAGE or FIXED" })
  discountType!: (typeof COUPON_TYPES)[number];

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: "Discount must be a number" })
  @Min(0.01, { message: "Discount must be more than 0" })
  discountTypeValue!: number;

  @IsUUID("all", { message: "Select a course" })
  courseId!: string;

  @Type(() => Number)
  @IsInt({ message: "Max uses must be a whole number" })
  @Min(1, { message: "Max uses must be at least 1" })
  @Max(1_000_000)
  maxUses!: number;

  @Type(() => Date)
  @IsDate({ message: "startDate must be a date" })
  startDate!: Date;

  @Type(() => Date)
  @IsDate({ message: "endDate must be a date" })
  endDate!: Date;

  @IsIn(COUPON_STATUSES, { message: "status must be ACTIVE or INACTIVE" })
  status: (typeof COUPON_STATUSES)[number] = "ACTIVE";
}

export class UpdateCouponDto extends PartialType(CreateCouponDto) {}
