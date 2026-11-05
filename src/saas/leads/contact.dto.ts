import { Transform } from "class-transformer";
import { IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";

const trim = () => Transform(({ value }) => (typeof value === "string" ? value.trim() : value));

export const LEAD_TOPICS = ["DEMO", "SALES", "SUPPORT", "PARTNERSHIP", "OTHER"] as const;
export const LEAD_SIZES = ["", "1-100", "101-500", "501-2000", "2000+"] as const;

/** POST /saas/public/contact — the marketing website's contact / demo form. */
export class ContactRequestDto {
  @trim() @IsString() @MinLength(2, { message: "Enter your name" }) @MaxLength(80, { message: "Name is too long" }) name!: string;
  @trim() @IsEmail({}, { message: "Enter a valid email address" }) @MaxLength(160) email!: string;
  @IsOptional() @trim() @IsString() @Matches(/^$|^[+\d][\d\s()-]{5,20}$/, { message: "Enter a valid phone number" }) phone?: string;
  @IsOptional() @trim() @IsString() @MaxLength(120, { message: "Institution name is too long" }) institutionName?: string;
  @IsOptional() @IsIn(LEAD_SIZES, { message: "Pick a student count" }) studentCount?: string;
  @IsIn(LEAD_TOPICS, { message: "Pick what you'd like to talk about" }) topic!: (typeof LEAD_TOPICS)[number];
  @trim() @IsString() @MinLength(10, { message: "Tell us a bit more (at least 10 characters)" }) @MaxLength(2000, { message: "Message is too long (2000 characters max)" }) message!: string;
  /** Honeypot: real visitors never see or fill it. */
  @IsOptional() @IsString() @MaxLength(200) website?: string;
}
