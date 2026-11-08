import { Transform } from "class-transformer";
import { Equals, IsIn, IsString, Matches, MaxLength, MinLength } from "class-validator";
import { SAAS_COUNTRIES } from "../saas.constants";
import { IsCycle, IsPlanId, IsSaasEmail, IsSaasName, IsSaasSlug } from "../dto/common";
import { INSTITUTION_TYPES, type InstitutionTypeValue } from "../dto/institution.dto";

const trim = () => Transform(({ value }) => (typeof value === "string" ? value.trim() : value));

/** GET /saas/public/checkout/quote — price + tax for a plan, cycle and country. */
export class CheckoutQuoteDto {
  @IsPlanId() planId!: string;
  @IsCycle() cycle!: "MONTHLY" | "YEARLY";
  @IsIn(SAAS_COUNTRIES, { message: "Choose a country" }) country!: string;
}

/** POST /saas/public/checkout — buy a plan on the website (no trial; paid now through SSLCommerz). */
export class StartCheckoutDto extends CheckoutQuoteDto {
  @IsSaasName("Your name") name!: string;
  @IsSaasEmail() email!: string;

  @trim()
  @IsString()
  @Matches(/^\+?[0-9][0-9 ()-]{6,18}$/, { message: "Enter a valid phone number" })
  phone!: string;

  @IsString()
  @MinLength(8, { message: "Password must be at least 8 characters" })
  @MaxLength(128, { message: "Password is too long" })
  @Matches(/[A-Za-z]/, { message: "Include at least one letter" })
  @Matches(/[0-9]/, { message: "Include at least one number" })
  password!: string;

  @IsSaasName("Academy name") institutionName!: string;
  @IsIn(INSTITUTION_TYPES, { message: "Choose an academy type" }) type!: InstitutionTypeValue;
  @IsSaasSlug() slug!: string;

  @Equals(true, { message: "You must accept the Terms of Service and Privacy Policy" })
  agreeTerms!: boolean;
}
