import { Equals, IsIn, IsString, Matches, MaxLength, MinLength } from "class-validator";
import { SAAS_COUNTRIES } from "../saas.constants";
import { IsCycle, IsPlanId, IsSaasEmail, IsSaasName, IsSaasSlug } from "./common";
import { INSTITUTION_TYPES, type InstitutionTypeValue } from "./institution.dto";

/** Public self-signup (/signup) — creates the institution on a free trial plus its admin user. */
export class SignupDto {
  @IsSaasName("Your name") name!: string;
  @IsSaasEmail() email!: string;

  @IsString()
  @MinLength(8, { message: "Password must be at least 8 characters" })
  @MaxLength(128, { message: "Password is too long" })
  @Matches(/[A-Za-z]/, { message: "Include at least one letter" })
  @Matches(/[0-9]/, { message: "Include at least one number" })
  password!: string;

  @IsSaasName("Institution name") institutionName!: string;
  @IsIn(INSTITUTION_TYPES, { message: "Choose an institution type" }) type!: InstitutionTypeValue;
  @IsIn(SAAS_COUNTRIES, { message: "Choose a country" }) country!: string;
  @IsSaasSlug() slug!: string;
  @IsPlanId() planId!: string;
  @IsCycle() cycle!: "MONTHLY" | "YEARLY";

  @Equals(true, { message: "You must accept the Terms of Service and Privacy Policy" })
  agreeTerms!: boolean;
}
