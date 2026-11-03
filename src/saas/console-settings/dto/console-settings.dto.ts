import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { INVOICE_PREFIX_REGEX, OPTIONAL_URL_REGEX } from "../console-settings.constants";
import {
  CONSOLE_CURRENCIES,
  CONSOLE_GATEWAY_MODES,
  type BillingSettings,
  type CompanySettings,
  type ConsoleGatewaySettings,
  type EmailSettings,
  type TrialsSettings,
} from "../console-settings.types";

/**
 * One DTO per Owner Console settings section — field rules + messages copied from the console's
 * consoleSettingsSchema. Cross-field rules (superRefine) live in console-settings.rules.ts. Each PATCH sends the whole section.
 */

const trim = () => Transform(({ value }) => (typeof value === "string" ? value.trim() : value));
const upperTrim = () => Transform(({ value }) => (typeof value === "string" ? value.trim().toUpperCase() : value));

// ---------------------------------------------------------------- company

export class CompanySettingsDto implements CompanySettings {
  @trim()
  @IsString({ message: "Legal name must be at least 2 characters" })
  @MinLength(2, { message: "Legal name must be at least 2 characters" })
  @MaxLength(120, { message: "Keep it under 120 characters" })
  legalName!: string;

  @trim()
  @IsString({ message: "Enter the registered address" })
  @MinLength(5, { message: "Enter the registered address" })
  @MaxLength(300, { message: "Keep it under 300 characters" })
  address!: string;

  @trim()
  @IsString({ message: "Support email is required" })
  @MinLength(1, { message: "Support email is required" })
  @IsEmail({}, { message: "Enter a valid email address" })
  @MaxLength(254, { message: "Enter a valid email address" })
  supportEmail!: string;

  @trim()
  @IsString()
  @Matches(OPTIONAL_URL_REGEX, { message: "Enter a full URL starting with https://" })
  @MaxLength(2000)
  website!: string;

  @trim() @IsString() @MaxLength(40, { message: "Keep it under 40 characters" }) taxId!: string;

  /** Hosted image URL (uploaded first) or "". */
  @trim()
  @IsString()
  @Matches(OPTIONAL_URL_REGEX, { message: "Upload the logo again" })
  @MaxLength(2000)
  logoUrl!: string;
}

// ---------------------------------------------------------------- billing

export class ConsoleGatewayDto implements ConsoleGatewaySettings {
  @IsBoolean() enabled!: boolean;
  @IsIn(CONSOLE_GATEWAY_MODES, { message: "Choose LIVE or TEST mode" }) mode!: ConsoleGatewaySettings["mode"];
  @trim() @IsString() @MaxLength(200, { message: "Key is too long" }) publicKey!: string;
  /** Write-only: "" keeps the saved secret. */
  @trim() @IsString() @MaxLength(200, { message: "Key is too long" }) secretKey: string = "";
}

const gateway = () => (target: object, key: string) => {
  IsObject()(target, key);
  ValidateNested()(target, key);
  Type(() => ConsoleGatewayDto)(target, key);
};

export class BillingSettingsDto implements BillingSettings {
  @IsIn(CONSOLE_CURRENCIES, { message: "Only USD is supported" }) currency!: BillingSettings["currency"];

  @IsNumber({ allowNaN: false, allowInfinity: false }, { message: "Enter a tax rate" })
  @Min(0, { message: "Tax can't be negative" })
  @Max(30, { message: "Tax can be at most 30%" })
  taxRate!: number;

  @upperTrim() @IsString() @Matches(INVOICE_PREFIX_REGEX, { message: "Use 2–6 capital letters, e.g. EDP" }) invoicePrefix!: string;
  @trim() @IsString() @MaxLength(200, { message: "Keep it under 200 characters" }) invoiceFooter!: string;

  @gateway() stripe!: ConsoleGatewayDto;
  @gateway() sslcommerz!: ConsoleGatewayDto;
  @gateway() bkash!: ConsoleGatewayDto;
}

// ---------------------------------------------------------------- trials & dunning

export class TrialsSettingsDto implements TrialsSettings {
  @IsNumber({}, { message: "Enter the trial length" })
  @IsInt({ message: "Use whole days" })
  @Min(0, { message: "Can't be negative" })
  @Max(90, { message: "Trials can be at most 90 days" })
  defaultTrialDays!: number;

  @IsBoolean() requireCardForTrial!: boolean;

  @IsNumber({}, { message: "Enter the grace period" })
  @IsInt({ message: "Use whole days" })
  @Min(0, { message: "Can't be negative" })
  @Max(60, { message: "At most 60 days" })
  gracePeriodDays!: number;

  @IsArray()
  @ArrayMinSize(1, { message: "Add at least one retry" })
  @ArrayMaxSize(6, { message: "At most 6 retries" })
  @IsInt({ each: true, message: "Retry days must be whole days between 1 and 30" })
  @Min(1, { each: true, message: "Retry days must be whole days between 1 and 30" })
  @Max(30, { each: true, message: "Retry days must be whole days between 1 and 30" })
  retryScheduleDays!: number[];

  @IsBoolean() suspendAfterGrace!: boolean;
}

// ---------------------------------------------------------------- email

export class EmailSettingsDto implements EmailSettings {
  @trim()
  @IsString({ message: "Sender name is required" })
  @MinLength(2, { message: "Sender name is required" })
  @MaxLength(60, { message: "Keep it under 60 characters" })
  senderName!: string;

  @trim()
  @IsString({ message: "Reply-to email is required" })
  @MinLength(1, { message: "Reply-to email is required" })
  @IsEmail({}, { message: "Enter a valid email address" })
  @MaxLength(254, { message: "Enter a valid email address" })
  replyTo!: string;

  @IsBoolean() trialEnding!: boolean;

  @IsNumber({}, { message: "Enter the number of days" })
  @IsInt({ message: "Use whole days" })
  @Min(1, { message: "At least 1 day" })
  @Max(14, { message: "At most 14 days" })
  trialEndingDays!: number;

  @IsBoolean() paymentFailed!: boolean;
  @IsBoolean() receipt!: boolean;
  @IsBoolean() renewalReminder!: boolean;
  @IsBoolean() cancellation!: boolean;
  @IsBoolean() welcome!: boolean;
}

export class ConsoleTestEmailDto {
  @trim()
  @IsString({ message: "That email address doesn't look right." })
  @IsEmail({}, { message: "That email address doesn't look right." })
  @MaxLength(254, { message: "That email address doesn't look right." })
  to!: string;
}
