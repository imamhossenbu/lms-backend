import { Type } from "class-transformer";
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from "class-validator";
import { NOTES_MAX, PHONE_REGEX, SAAS_COUNTRIES, TONES } from "../saas.constants";
import { IsCycle, IsPlanId, IsSaasEmail, IsSaasName, IsSaasSlug, Trim } from "./common";

export const INSTITUTION_TYPES = ["SCHOOL", "COACHING", "UNIVERSITY", "COMPANY", "CREATOR"] as const;
export type InstitutionTypeValue = (typeof INSTITUTION_TYPES)[number];

const IsInstitutionType = () => IsIn(INSTITUTION_TYPES, { message: "Choose an institution type" });
const IsCountry = () => IsIn(SAAS_COUNTRIES, { message: "Choose a country" });

/** Phone is optional: empty string or 7–20 digits / spaces / ()+-. */
const IsPhone = () => (target: object, key: string) => {
  Trim()(target, key);
  IsString()(target, key);
  MaxLength(20, { message: "Phone number is too long" })(target, key);
  Matches(new RegExp(`^$|${PHONE_REGEX.source}`), { message: "Enter a valid phone number" })(target, key);
};

/** Owner creates an institution (Console › Institutions › Add). */
export class CreateInstitutionDto {
  @IsSaasName("Institution name") name!: string;
  @IsInstitutionType() type!: InstitutionTypeValue;
  @IsCountry() country!: string;
  @IsSaasName("Owner name") ownerName!: string;
  @IsSaasEmail() ownerEmail!: string;
  @IsPhone() phone: string = "";
  @IsSaasSlug() slug!: string;
  @IsPlanId() planId!: string;
  @IsCycle() cycle!: "MONTHLY" | "YEARLY";
  @IsBoolean() startWithTrial!: boolean;

  @Type(() => Number)
  @IsInt({ message: "Trial days must be whole days" })
  @Min(1, { message: "At least 1 day" })
  @Max(60, { message: "Trials are limited to 60 days" })
  trialDays: number = 14;

  @Trim()
  @IsString()
  @MaxLength(NOTES_MAX, { message: `Notes must be ${NOTES_MAX} characters or less` })
  notes: string = "";
}

/** Partial edit of institution details (owner). */
export class UpdateInstitutionDto {
  @IsOptional() @IsSaasName("Institution name") name?: string;
  @IsOptional() @IsInstitutionType() type?: InstitutionTypeValue;
  @IsOptional() @IsCountry() country?: string;
  @IsOptional() @IsSaasName("Owner name") ownerName?: string;
  @IsOptional() @IsSaasEmail() ownerEmail?: string;
  @IsOptional() @IsPhone() phone?: string;
  @IsOptional() @IsSaasSlug() slug?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(NOTES_MAX, { message: `Notes must be ${NOTES_MAX} characters or less` })
  notes?: string;

  @IsOptional()
  @IsIn(TONES, { message: "Unknown tone" })
  tone?: string;
}

export class AddNoteDto {
  @Trim()
  @IsString()
  @MinLength(2, { message: "Write a note first." })
  @MaxLength(NOTES_MAX, { message: "Notes are limited to 1,000 characters." })
  note!: string;
}

export class SlugAvailabilityQueryDto {
  @Trim()
  @IsString()
  @MaxLength(64)
  slug!: string;

  @IsOptional()
  @Trim()
  @IsString()
  exceptId?: string;
}
