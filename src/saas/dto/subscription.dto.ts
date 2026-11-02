import { Transform, Type } from "class-transformer";
import { IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from "class-validator";
import { HOSTNAME_REGEX, PAYMENT_BRANDS, type PaymentBrand } from "../saas.constants";
import { IsCycle, IsPlanId, Trim } from "./common";

export class ChangePlanDto {
  @IsPlanId() planId!: string;
  @IsCycle() cycle!: "MONTHLY" | "YEARLY";
}

export class CancelSubscriptionDto {
  /** true = keep access until the period ends; false = cancel now and void unpaid invoices. */
  @IsBoolean() atPeriodEnd!: boolean;
}

export class SuspendInstitutionDto {
  @Trim()
  @IsString()
  @MinLength(5, { message: "Add a short reason (at least 5 characters)." })
  @MaxLength(500, { message: "Reason must be 500 characters or less." })
  reason!: string;
}

export class ExtendTrialDto {
  @Type(() => Number)
  @IsInt({ message: "Extend by whole days." })
  @Min(1, { message: "Extend by 1 to 60 days." })
  @Max(60, { message: "Extend by 1 to 60 days." })
  days!: number;
}

export class PaymentMethodDto {
  @IsIn(PAYMENT_BRANDS, { message: "Choose a payment method" })
  brand!: PaymentBrand;

  @Trim()
  @IsString()
  @Matches(/^\d{4}$/, { message: "Enter the last 4 digits" })
  last4!: string;
}

export class ConvertTrialDto {
  @IsPlanId() planId!: string;
  @IsCycle() cycle!: "MONTHLY" | "YEARLY";

  @IsObject()
  @ValidateNested()
  @Type(() => PaymentMethodDto)
  paymentMethod!: PaymentMethodDto;
}

export class CustomDomainDto {
  /** Accepts "https://Learn.School.com/" and normalises to "learn.school.com". */
  @Transform(({ value }) =>
    typeof value === "string"
      ? value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\.$/, "")
      : value,
  )
  @IsString({ message: "Enter a domain" })
  @Matches(HOSTNAME_REGEX, { message: "Enter a valid domain, e.g. learn.yourschool.com" })
  domain!: string;
}

export class ListInvoicesQueryDto {
  @IsOptional() @Trim() @IsString() institutionId?: string;
  @IsOptional() @IsIn(["PAID", "OPEN", "FAILED", "REFUNDED", "VOID"]) status?: "PAID" | "OPEN" | "FAILED" | "REFUNDED" | "VOID";
}

export class ListEventsQueryDto {
  @IsOptional() @Trim() @IsString() institutionId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2000)
  limit?: number;
}
