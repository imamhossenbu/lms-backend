import { Type } from "class-transformer";
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { FEATURE_KEYS, TAGLINE_MAX, type FeatureKey } from "../saas.constants";
import { Trim } from "./common";

/** A limit is a whole number ≥ 1, or null (unlimited). */
const Limit = (label: string) => (target: object, key: string) => {
  ValidateIf((_, v) => v !== null)(target, key);
  IsInt({ message: `${label} limit must be a whole number (or null for unlimited)` })(target, key);
  Min(1, { message: `${label} limit must be at least 1` })(target, key);
  Max(10_000_000, { message: `${label} limit is too large` })(target, key);
};

export class PlanLimitsDto {
  @Limit("Students") students!: number | null;
  @Limit("Courses") courses!: number | null;
  @Limit("Team members") teamMembers!: number | null;
  @Limit("Storage") storageGb!: number | null;
}

/** Plan editor (Console › Plans & pricing) — create and full update. */
export class PlanDto {
  @Trim()
  @IsString()
  @MinLength(2, { message: "Plan name must be at least 2 characters" })
  @MaxLength(30, { message: "Plan name must be 30 characters or less" })
  name!: string;

  @Trim()
  @IsString()
  @MinLength(4, { message: "Add a short tagline" })
  @MaxLength(TAGLINE_MAX, { message: `Tagline must be ${TAGLINE_MAX} characters or less` })
  tagline!: string;

  @IsNumber({ maxDecimalPlaces: 2 }, { message: "Monthly price must be a number" })
  @Min(0, { message: "Price can't be negative" })
  @Max(100_000, { message: "Price is too high" })
  priceMonthly!: number;

  @IsNumber({ maxDecimalPlaces: 2 }, { message: "Yearly price must be a number" })
  @Min(0, { message: "Price can't be negative" })
  @Max(1_200_000, { message: "Price is too high" })
  priceYearly!: number;

  @IsObject()
  @ValidateNested()
  @Type(() => PlanLimitsDto)
  limits!: PlanLimitsDto;

  @IsArray()
  @ArrayUnique({ message: "Duplicate features" })
  @IsIn(FEATURE_KEYS, { each: true, message: "Unknown feature" })
  features!: FeatureKey[];

  @IsBoolean()
  highlighted!: boolean;

  @IsBoolean()
  isPublic!: boolean;

  @IsInt({ message: "Trial days must be whole days" })
  @Min(0, { message: "Trial days can't be negative" })
  @Max(60, { message: "Trials are limited to 60 days" })
  trialDays!: number;
}

export class ArchivePlanDto {
  @IsBoolean()
  archived!: boolean;
}
