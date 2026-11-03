import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from "class-validator";
import { PaginationQueryDto } from "../../common/pagination";
import { CERT_LIMITS, ISSUE_METHODS, ISSUED_STATUSES, REVOKE_REASONS } from "../certificates.constants";
import type { IssueMethod, IssuedStatus } from "../certificates.types";

const trim = () => Transform(({ value }) => (typeof value === "string" ? value.trim() : value));
/** The panel's selects use "All" for "no filter". */
const allToUndefined = () => Transform(({ value }) => (value === "All" || value === "" ? undefined : value));
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Manual issue modal (issueCertificateSchema). */
export class IssueCertificateDto {
  @IsUUID("all", { message: "Select a course" }) courseId!: string;
  @IsUUID("all", { message: "Select a learner" }) recipientId!: string;

  @IsOptional()
  @ValidateIf((o: IssueCertificateDto) => o.grade !== null)
  @IsInt({ message: "Whole numbers only" })
  @Min(0, { message: "0 or more" })
  @Max(100, { message: "100 or less" })
  grade: number | null = null;

  @Matches(DATE_RE, { message: "Pick the completion date" }) completedAt!: string;
  @IsOptional() @IsBoolean() sendEmail: boolean = false;
  @IsOptional() @trim() @IsString() @MaxLength(CERT_LIMITS.noteMax, { message: "200 characters or less" }) note: string = "";
}

/** Revoke modal (revokeCertificateSchema). "OTHER" needs details — checked in certificate-rules. */
export class RevokeCertificateDto {
  @IsIn(REVOKE_REASONS, { message: "Pick a reason" }) reason!: (typeof REVOKE_REASONS)[number];
  @IsOptional() @trim() @IsString() @MaxLength(CERT_LIMITS.detailsMax, { message: "300 characters or less" }) details: string = "";
  @IsOptional() @IsBoolean() notifyLearner: boolean = false;
}

export class BulkIdsDto {
  @IsArray()
  @ArrayMinSize(1, { message: "Select at least one certificate" })
  @ArrayMaxSize(CERT_LIMITS.bulkMax, { message: "Up to 200 certificates at a time" })
  @IsUUID("all", { each: true, message: "Certificate id is invalid" })
  ids!: string[];
}

export class BulkRevokeDto extends RevokeCertificateDto {
  @IsArray()
  @ArrayMinSize(1, { message: "Select at least one certificate" })
  @ArrayMaxSize(CERT_LIMITS.bulkMax, { message: "Up to 200 certificates at a time" })
  @IsUUID("all", { each: true, message: "Certificate id is invalid" })
  ids!: string[];
}

/** "Issue to all (N)" on the Eligible tab. */
export class IssueEligibleDto {
  @IsUUID("all", { message: "Select a course" }) courseId!: string;
  @IsOptional() @IsBoolean() sendEmail: boolean = false;
}

export class VerifyCodeDto {
  @trim() @IsString() @MinLength(1, { message: "Enter a certificate code" }) @MaxLength(64, { message: "64 characters or less" }) code!: string;
}

/** Shared filters of the Issued tab (list + export). */
export class IssuedFilterDto extends PaginationQueryDto {
  @IsOptional() @trim() @IsString() @MaxLength(200) q?: string;
  @IsOptional() @allToUndefined() @IsUUID("all", { message: "Select a valid course" }) courseId?: string;
  @IsOptional() @allToUndefined() @IsUUID("all", { message: "Select a valid template" }) templateId?: string;
  @IsOptional() @allToUndefined() @IsIn(ISSUED_STATUSES) status?: IssuedStatus;
  @IsOptional() @allToUndefined() @IsIn(ISSUE_METHODS) method?: IssueMethod;
  /** Issued on/after this workspace-local day. */
  @IsOptional() @allToUndefined() @Matches(DATE_RE, { message: "from must be YYYY-MM-DD" }) from?: string;
  /** Issued on/before this workspace-local day. */
  @IsOptional() @allToUndefined() @Matches(DATE_RE, { message: "to must be YYYY-MM-DD" }) to?: string;
  @IsOptional() @IsIn(["issuedAt", "name", "expiresAt", "code"]) sortBy: "issuedAt" | "name" | "expiresAt" | "code" = "issuedAt";
  @IsOptional() @IsIn(["asc", "desc"]) sortOrder: "asc" | "desc" = "desc";
}

export class CourseFilterDto {
  @IsOptional() @allToUndefined() @IsUUID("all", { message: "Select a valid course" }) courseId?: string;
}

export class LearnerQueryDto extends CourseFilterDto {
  @IsOptional() @trim() @IsString() @MaxLength(200) q?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit: number = 40;
}

export class ActivityQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit: number = 8;
}
