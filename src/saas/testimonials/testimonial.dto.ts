import { Transform, Type } from "class-transformer";
import { IsBoolean, IsInt, IsOptional, IsString, IsUrl, Max, MaxLength, Min, MinLength, ValidateIf } from "class-validator";
import { PaginationQueryDto } from "../../common/pagination";

const trim = () => Transform(({ value }) => (typeof value === "string" ? value.trim() : value));

/** Body of POST / PATCH /saas/owner/testimonials (PATCH: any subset). */
export class TestimonialFormDto {
  @trim() @IsString() @MinLength(20, { message: "The quote needs at least 20 characters" }) @MaxLength(400, { message: "Keep the quote under 400 characters" }) quote!: string;
  @trim() @IsString() @MinLength(2, { message: "Enter the person's name" }) @MaxLength(80) name!: string;
  @IsOptional() @trim() @IsString() @MaxLength(120, { message: "Role is too long" }) role?: string;
  @IsOptional() @trim() @ValidateIf((_, v) => v !== "") @IsUrl({ protocols: ["https"], require_protocol: true }, { message: "Photo must be an https:// URL" }) @MaxLength(2000) avatarUrl?: string;
  @IsOptional() @IsBoolean() isPublished?: boolean;
  @IsOptional() @IsBoolean() featured?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(999) order?: number;
}

export class UpdateTestimonialDto {
  @IsOptional() @trim() @IsString() @MinLength(20, { message: "The quote needs at least 20 characters" }) @MaxLength(400, { message: "Keep the quote under 400 characters" }) quote?: string;
  @IsOptional() @trim() @IsString() @MinLength(2, { message: "Enter the person's name" }) @MaxLength(80) name?: string;
  @IsOptional() @trim() @IsString() @MaxLength(120, { message: "Role is too long" }) role?: string;
  @IsOptional() @trim() @ValidateIf((_, v) => v !== "") @IsUrl({ protocols: ["https"], require_protocol: true }, { message: "Photo must be an https:// URL" }) @MaxLength(2000) avatarUrl?: string;
  @IsOptional() @IsBoolean() isPublished?: boolean;
  @IsOptional() @IsBoolean() featured?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(999) order?: number;
}

export class ListTestimonialsQueryDto extends PaginationQueryDto {
  /** Searches quote, name and role. */
  @IsOptional() @trim() @IsString() @MaxLength(100) q?: string;
  /** "published" | "draft". */
  @IsOptional() @trim() @IsString() status?: string;
}
