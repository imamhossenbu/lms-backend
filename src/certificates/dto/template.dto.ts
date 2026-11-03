import { PartialType } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDefined,
  IsIn,
  IsInt,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { CERT_ACCENTS, CERT_LAYOUTS, CERT_LIMITS, CERT_ORIENTATIONS, TEMPLATE_STATUSES } from "../certificates.constants";
import type { CertificateAccent, CertificateLayout, CertificateOrientation, TemplateStatus } from "../certificates.types";

const trim = () => Transform(({ value }) => (typeof value === "string" ? value.trim() : value));
/** Strip anything tag-like: bodyText / heading are plain text rendered on the certificate. */
const plain = () => Transform(({ value }) => (typeof value === "string" ? value.replace(/<[^>]*>/g, "").trim() : value));
const CLIENT_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export class SignerDto {
  @Matches(CLIENT_ID_RE, { message: "Signer id is invalid" }) id!: string;
  @plain() @IsString() @MinLength(CERT_LIMITS.signerMin, { message: "Signer name is required" }) @MaxLength(CERT_LIMITS.signerMax, { message: "60 characters or less" })
  name!: string;
  @plain() @IsString() @MinLength(CERT_LIMITS.signerMin, { message: "Signer title is required" }) @MaxLength(CERT_LIMITS.signerMax, { message: "60 characters or less" })
  title!: string;
  /** "" = typed signature; otherwise an uploaded image URL. */
  @trim()
  @IsString()
  @ValidateIf((o: SignerDto) => o.signatureUrl !== "")
  @IsUrl({ protocols: ["http", "https"], require_protocol: true, require_tld: false }, { message: "Signature must be an uploaded image URL" })
  @MaxLength(2000)
  signatureUrl!: string;
}

export class IssueRulesDto {
  @IsBoolean() autoIssue!: boolean;

  @IsDefined({ message: "Enter a percentage" })
  @IsInt({ message: "Whole numbers only" })
  @Min(1, { message: "At least 1%" })
  @Max(100, { message: "100% or less" })
  minCompletion!: number;

  @ValidateIf((o: IssueRulesDto) => o.minQuizScore !== null)
  @IsInt({ message: "Whole numbers only" })
  @Min(1, { message: "At least 1%" })
  @Max(100, { message: "100% or less" })
  minQuizScore!: number | null;

  @IsBoolean() requireAssignments!: boolean;

  @ValidateIf((o: IssueRulesDto) => o.validityMonths !== null)
  @IsInt({ message: "Whole months only" })
  @Min(1, { message: "At least 1 month" })
  @Max(CERT_LIMITS.validityMax, { message: "Up to 120 months" })
  validityMonths!: number | null;
}

/** Template designer — same fields and messages as the panel's templateFormSchema. */
export class CreateTemplateDto {
  @plain() @IsString() @MinLength(CERT_LIMITS.nameMin, { message: "Template name must be at least 3 characters" }) @MaxLength(CERT_LIMITS.nameMax, { message: "80 characters or less" })
  name!: string;

  @IsIn(CERT_LAYOUTS, { message: "Pick a layout" }) layout!: CertificateLayout;
  @IsIn(CERT_ORIENTATIONS, { message: "Pick an orientation" }) orientation!: CertificateOrientation;
  @IsIn(CERT_ACCENTS, { message: "Pick an accent colour" }) accent!: CertificateAccent;

  @plain() @IsString() @MinLength(CERT_LIMITS.headingMin, { message: "Heading is required" }) @MaxLength(CERT_LIMITS.headingMax, { message: "60 characters or less" })
  heading!: string;

  @plain() @IsString() @MinLength(CERT_LIMITS.bodyMin, { message: "Write at least 20 characters" }) @MaxLength(CERT_LIMITS.bodyMax, { message: "400 characters or less" })
  bodyText!: string;

  @IsBoolean() showLogo!: boolean;
  @IsBoolean() showQr!: boolean;
  @IsBoolean() showGrade!: boolean;

  @IsArray()
  @ArrayMinSize(1, { message: "Add at least one signer" })
  @ArrayMaxSize(CERT_LIMITS.maxSigners, { message: "Up to 3 signers" })
  @ValidateNested({ each: true })
  @Type(() => SignerDto)
  signers!: SignerDto[];

  @IsArray()
  @ArrayMaxSize(CERT_LIMITS.maxCourses)
  @IsUUID("all", { each: true, message: "Select a valid course" })
  courseIds!: string[];

  @IsDefined()
  @ValidateNested()
  @Type(() => IssueRulesDto)
  rules!: IssueRulesDto;

  @IsIn(TEMPLATE_STATUSES, { message: "Pick a status" }) status!: TemplateStatus;
}

/** Any subset (designer edit, Activate / Archive / Move to draft). Cross-field rules run on the merged template. */
export class UpdateTemplateDto extends PartialType(CreateTemplateDto) {}
