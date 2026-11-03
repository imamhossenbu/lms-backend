import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsString,
  IsTimeZone,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import {
  ACCENTS,
  BACKUP_FREQUENCIES,
  CURRENCIES,
  DATE_FORMATS,
  DIGEST_DAYS,
  EMAIL_PROVIDERS,
  ENROLLMENT_APPROVALS,
  GATEWAY_MODES,
  TIME_FORMATS,
  WEEK_STARTS,
} from "../workspace-settings.constants";
import type {
  BrandingSettings,
  EmailSettings,
  GatewaySettings,
  GeneralSettings,
  IntegrationSettings,
  LearningSettings,
  MaintenanceSettings,
  PaymentSettings,
  SecuritySettings,
} from "../workspace-settings.types";

/**
 * One DTO per Settings section — field rules and messages copied from the panel's platformSettingsSchema.
 * Cross-field rules (superRefine) live in workspace-settings.rules.ts. Each PATCH sends the whole section.
 */

const trim = () => Transform(({ value }) => (typeof value === "string" ? value.trim() : value));
const URL_RE = /^$|^https?:\/\/[^\s]+\.[^\s]+/;
const URL_MSG = { message: "Enter a valid URL starting with https://" };
const PHONE_RE = /^$|^\+?[0-9\s-]{7,20}$/;
const OPTIONAL_EMAIL_RE = /^$|^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const IPV4_CIDR_RE = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
const max = (n: number) => MaxLength(n, { message: `${n} characters or less` });
/** Hosted image URL or "" (uploads go to Cloudinary first; never blob:/data: URLs). */
const imageUrl = () => [trim(), IsString(), Matches(URL_RE, URL_MSG), MaxLength(2000)];
const apply =
  (...ds: PropertyDecorator[]): PropertyDecorator =>
  (t, k) =>
    ds.forEach((d) => d(t, k));
/** z.number({ error: "Enter …" }).int() */
const int = (enter: string) => apply(IsNumber({}, { message: enter }), IsInt({ message: "Whole numbers only" }));
const percent = (label: string) => apply(IsNumber({}, { message: `Enter ${label}` }), Min(0, { message: "Can't be negative" }), Max(100, { message: "100 or less" }));

// ---------------------------------------------------------------- General

export class GeneralSettingsDto implements GeneralSettings {
  @trim() @IsString() @MinLength(2, { message: "Platform name is required" }) @max(60) platformName!: string;
  @trim() @IsString() @max(120) tagline!: string;
  @trim() @IsEmail({}, { message: "Enter a valid email" }) supportEmail!: string;
  @trim() @IsString() @Matches(PHONE_RE, { message: "Enter a valid phone number" }) supportPhone!: string;
  @trim() @IsString() @Matches(URL_RE, URL_MSG) @MaxLength(2000) websiteUrl!: string;
  @trim() @IsString() @max(200) address!: string;
  @IsString() @MinLength(1, { message: "Select a timezone" }) @IsTimeZone({ message: "Select a timezone" }) timezone!: string;
  @IsIn(DATE_FORMATS) dateFormat!: GeneralSettings["dateFormat"];
  @IsIn(TIME_FORMATS) timeFormat!: GeneralSettings["timeFormat"];
  @IsIn(CURRENCIES) currency!: GeneralSettings["currency"];
  @IsIn(WEEK_STARTS) weekStartsOn!: GeneralSettings["weekStartsOn"];
}

// ---------------------------------------------------------------- Branding

export class BrandingSettingsDto implements BrandingSettings {
  @apply(...imageUrl()) logoUrl!: string;
  @apply(...imageUrl()) logoDarkUrl!: string;
  @apply(...imageUrl()) faviconUrl!: string;
  @apply(...imageUrl()) loginImageUrl!: string;
  @IsIn(ACCENTS) accent!: BrandingSettings["accent"];
  @trim() @IsString() @MinLength(3, { message: "Headline is required" }) @max(80) loginHeadline!: string;
  @trim() @IsString() @max(160) loginSubtext!: string;
  @trim() @IsString() @max(120) footerText!: string;
  @IsBoolean() showPoweredBy!: boolean;
}

// ---------------------------------------------------------------- Learning

export class LearningSettingsDto implements LearningSettings {
  @IsIn(ENROLLMENT_APPROVALS) enrollmentApproval!: LearningSettings["enrollmentApproval"];
  @IsBoolean() allowGuestPreview!: boolean;
  @int("Enter a percentage") @Min(50, { message: "At least 50%" }) @Max(100, { message: "100% or less" }) completionThreshold!: number;
  @IsBoolean() sequentialLessons!: boolean;
  @IsBoolean() allowReviews!: boolean;
  @IsBoolean() reviewModeration!: boolean;
  @IsBoolean() enableCommunity!: boolean;
  @IsBoolean() autoIssueCertificates!: boolean;
  @int("Enter a size") @Min(1, { message: "At least 1 MB" }) @Max(2048, { message: "Up to 2048 MB" }) maxUploadMb!: number;
  @percent("a passing score") defaultPassingScore!: number;
  @percent("a penalty") lateSubmissionPenalty!: number;
}

// ---------------------------------------------------------------- Payments

export class GatewaySettingsDto implements GatewaySettings {
  @IsBoolean() enabled!: boolean;
  @IsIn(GATEWAY_MODES) mode!: GatewaySettings["mode"];
  @trim() @IsString() @MaxLength(200) publicKey!: string;
  /** Write-only; "" = keep the stored secret. */
  @trim() @IsString() @MaxLength(500) secretKey!: string;
}

export class PaymentSettingsDto implements PaymentSettings {
  @ValidateNested() @Type(() => GatewaySettingsDto) sslcommerz!: GatewaySettingsDto;
  @ValidateNested() @Type(() => GatewaySettingsDto) stripe!: GatewaySettingsDto;
  @ValidateNested() @Type(() => GatewaySettingsDto) bkash!: GatewaySettingsDto;
  @percent("a tax rate") taxRate!: number;
  @IsBoolean() taxInclusive!: boolean;
  @int("Enter days") @Min(0, { message: "0 or more" }) @Max(90, { message: "Up to 90 days" }) refundWindowDays!: number;
  @trim()
  @IsString()
  @MinLength(2, { message: "At least 2 characters" })
  @MaxLength(8, { message: "8 characters or less" })
  @Matches(/^[A-Z0-9-]+$/, { message: "Use capital letters, numbers and dashes" })
  invoicePrefix!: string;
  @trim() @IsString() @max(200) invoiceFooter!: string;
}

// ---------------------------------------------------------------- Email

export class EmailSettingsDto implements EmailSettings {
  @trim() @IsString() @MinLength(2, { message: "Sender name is required" }) @max(60) senderName!: string;
  @trim() @IsEmail({}, { message: "Enter a valid email" }) senderEmail!: string;
  @trim() @IsString() @Matches(OPTIONAL_EMAIL_RE, { message: "Enter a valid email" }) replyTo!: string;
  @IsIn(EMAIL_PROVIDERS) provider!: EmailSettings["provider"];
  /** Write-only; "" = keep the stored key. */
  @trim() @IsString() @MaxLength(500) resendApiKey!: string;
  @trim() @IsString() @MaxLength(255) smtpHost!: string;
  @int("Enter a port") @Min(1, { message: "1–65535" }) @Max(65535, { message: "1–65535" }) smtpPort!: number;
  @trim() @IsString() @MaxLength(255) smtpUser!: string;
  /** Write-only; "" = keep the stored password. */
  @trim() @IsString() @MaxLength(500) smtpPassword!: string;
  @IsBoolean() smtpSecure!: boolean;
  @IsBoolean() digestEnabled!: boolean;
  @IsIn(DIGEST_DAYS) digestDay!: EmailSettings["digestDay"];
}

/** Settings › Email › Send test email. */
export class TestEmailDto {
  @trim() @IsEmail({}, { message: "Enter a valid email address." }) to!: string;
}

// ---------------------------------------------------------------- Security

export class SecuritySettingsDto implements SecuritySettings {
  @IsBoolean() requireAdmin2fa!: boolean;
  @int("Enter a length") @Min(8, { message: "At least 8" }) @Max(64, { message: "Up to 64" }) passwordMinLength!: number;
  @IsBoolean() requireUppercase!: boolean;
  @IsBoolean() requireNumber!: boolean;
  @IsBoolean() requireSymbol!: boolean;
  @ValidateIf((o) => o.passwordExpiryDays !== null)
  @int("Enter days")
  @Min(30, { message: "At least 30 days" })
  @Max(365, { message: "Up to 365 days" })
  passwordExpiryDays!: number | null;
  @int("Enter minutes") @Min(5, { message: "At least 5 minutes" }) @Max(1440, { message: "Up to 24 hours" }) sessionTimeoutMinutes!: number;
  @int("Enter a number") @Min(3, { message: "At least 3" }) @Max(20, { message: "Up to 20" }) maxLoginAttempts!: number;
  @int("Enter minutes") @Min(1, { message: "At least 1 minute" }) @Max(1440, { message: "Up to 24 hours" }) lockoutMinutes!: number;
  @IsBoolean() ipAllowlistEnabled!: boolean;
  @Transform(({ value }) => (Array.isArray(value) ? value.map((v) => (typeof v === "string" ? v.trim() : v)) : value))
  @IsArray()
  @ArrayMaxSize(50, { message: "Up to 50 entries" })
  @IsString({ each: true })
  @Matches(IPV4_CIDR_RE, { each: true, message: "Use an IPv4 address or CIDR (e.g. 10.0.0.0/24)" })
  ipAllowlist!: string[];
}

// ---------------------------------------------------------------- Integrations

export class IntegrationSettingsDto implements IntegrationSettings {
  @IsBoolean() connected!: boolean;
  @trim() @IsString() @MaxLength(200) accountLabel!: string;
  /** Write-only; "" = keep the stored key. */
  @trim() @IsString() @MaxLength(500) apiKey!: string;
  @trim() @IsString() @MaxLength(200) option!: string;
}

export class IntegrationsSettingsDto {
  @ValidateNested() @Type(() => IntegrationSettingsDto) zoom!: IntegrationSettingsDto;
  @ValidateNested() @Type(() => IntegrationSettingsDto) googleMeet!: IntegrationSettingsDto;
  @ValidateNested() @Type(() => IntegrationSettingsDto) cloudinary!: IntegrationSettingsDto;
  @ValidateNested() @Type(() => IntegrationSettingsDto) ai!: IntegrationSettingsDto;
  @ValidateNested() @Type(() => IntegrationSettingsDto) googleAnalytics!: IntegrationSettingsDto;
}

// ---------------------------------------------------------------- Maintenance

export class MaintenanceSettingsDto implements MaintenanceSettings {
  @IsBoolean() maintenanceMode!: boolean;
  @trim() @IsString() @max(200) maintenanceMessage!: string;
  /** ISO date-time or "" — expected end shown to visitors. */
  @IsString() @Matches(/^$|^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/, { message: "Enter a valid date and time" }) maintenanceUntil!: string;
  @IsBoolean() allowAdminsDuringMaintenance!: boolean;
  @IsBoolean() autoBackup!: boolean;
  @IsIn(BACKUP_FREQUENCIES) backupFrequency!: MaintenanceSettings["backupFrequency"];
  @int("Enter days") @Min(7, { message: "At least 7 days" }) @Max(365, { message: "Up to 365 days" }) backupRetentionDays!: number;
}

// ---------------------------------------------------------------- actions

/** Remove a stored secret, e.g. "integrations.zoom.apiKey" when disconnecting. */
export class ClearSecretDto {
  @IsString() @MaxLength(100) path!: string;
}
