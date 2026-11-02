import { Transform } from "class-transformer";
import { applyDecorators } from "@nestjs/common";
import { IsIn, IsNotEmpty, IsString, Matches, MaxLength, MinLength, registerDecorator, type ValidationOptions } from "class-validator";
import { isReservedSlug, NAME_MAX, SLUG_REGEX } from "../saas.constants";

/** Trims string input (leaves other types untouched so the type validators can reject them). */
export const Trim = () => Transform(({ value }) => (typeof value === "string" ? value.trim() : value));

/** Trims + lowercases string input. */
export const TrimLower = () => Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value));

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** A person / institution name: 2–80 chars. */
export const IsSaasName = (label: string) =>
  applyDecorators(
    Trim(),
    IsString({ message: `${label} must be text` }),
    MinLength(2, { message: `${label} must be at least 2 characters` }),
    MaxLength(NAME_MAX, { message: `${label} must be ${NAME_MAX} characters or less` }),
  );

export const IsSaasEmail = () =>
  applyDecorators(
    TrimLower(),
    IsString({ message: "Email is required" }),
    IsNotEmpty({ message: "Email is required" }),
    MaxLength(254, { message: "Email is too long" }),
    Matches(EMAIL_RE, { message: "Enter a valid email address" }),
  );

function NotReservedSlug(options?: ValidationOptions): PropertyDecorator {
  return (object: object, propertyName: string | symbol) =>
    registerDecorator({
      name: "notReservedSlug",
      target: object.constructor,
      propertyName: String(propertyName),
      options: { message: "This subdomain is reserved — choose another", ...options },
      validator: { validate: (v: unknown) => typeof v === "string" && !isReservedSlug(v) },
    });
}

/** Subdomain: 3–32 lowercase letters / digits / hyphens, not reserved. */
export const IsSaasSlug = () =>
  applyDecorators(
    TrimLower(),
    IsString({ message: "Subdomain is required" }),
    MinLength(3, { message: "Subdomain must be at least 3 characters" }),
    MaxLength(32, { message: "Subdomain must be 32 characters or less" }),
    Matches(SLUG_REGEX, { message: "Use lowercase letters, numbers and hyphens (not at the start or end)" }),
    NotReservedSlug(),
  );

export const IsCycle = () => IsIn(["MONTHLY", "YEARLY"], { message: "Billing cycle must be MONTHLY or YEARLY" });

export const IsPlanId = () =>
  applyDecorators(Trim(), IsString({ message: "Choose a plan" }), IsNotEmpty({ message: "Choose a plan" }), MaxLength(64));
