import { Transform, Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUrl, Matches, Max, MaxLength, Min, MinLength, ValidateIf } from "class-validator";
import { PaginationQueryDto } from "../../common/pagination";

const trim = () => Transform(({ value }) => (typeof value === "string" ? value.trim() : value));
const tagsIn = () =>
  Transform(({ value }) =>
    Array.isArray(value) ? [...new Set(value.map((t) => String(t).trim()).filter(Boolean))] : typeof value === "string" ? [...new Set(value.split(",").map((t) => t.trim()).filter(Boolean))] : value
  );
const httpsUrl = (what: string) => IsUrl({ protocols: ["https"], require_protocol: true }, { message: `${what} must be an https:// URL` });
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Body of POST /saas/owner/blog. `slug` is generated from the title when left out. */
export class BlogPostFormDto {
  @trim() @IsString() @MinLength(8, { message: "The title needs at least 8 characters" }) @MaxLength(140, { message: "Keep the title under 140 characters" }) title!: string;
  @IsOptional() @trim() @ValidateIf((_, v) => v !== "") @Matches(SLUG_RE, { message: "Slug: lowercase letters, numbers and hyphens only" }) @MaxLength(100) slug?: string;
  @trim() @IsString() @MinLength(30, { message: "The summary needs at least 30 characters" }) @MaxLength(300, { message: "Keep the summary under 300 characters" }) excerpt!: string;
  @IsString() @MinLength(200, { message: "The article needs at least 200 characters" }) @MaxLength(100_000) content!: string;
  @IsOptional() @trim() @ValidateIf((_, v) => v !== "") @httpsUrl("Cover image") @MaxLength(2000) coverUrl?: string;
  @IsOptional() @trim() @IsString() @MinLength(2) @MaxLength(40) category?: string;
  @IsOptional() @tagsIn() @IsArray() @ArrayMaxSize(8, { message: "Use at most 8 tags" }) @IsString({ each: true }) @MaxLength(30, { each: true }) tags?: string[];
  @IsOptional() @trim() @IsString() @MinLength(2) @MaxLength(80) authorName?: string;
  @IsOptional() @trim() @IsString() @MaxLength(80) authorRole?: string;
  @IsOptional() @trim() @ValidateIf((_, v) => v !== "") @httpsUrl("Author photo") @MaxLength(2000) authorAvatarUrl?: string;
  @IsOptional() @IsBoolean() isPublished?: boolean;
  @IsOptional() @IsBoolean() featured?: boolean;
}

/** Body of PATCH /saas/owner/blog/:id — any subset. */
export class UpdateBlogPostDto {
  @IsOptional() @trim() @IsString() @MinLength(8, { message: "The title needs at least 8 characters" }) @MaxLength(140, { message: "Keep the title under 140 characters" }) title?: string;
  @IsOptional() @trim() @Matches(SLUG_RE, { message: "Slug: lowercase letters, numbers and hyphens only" }) @MaxLength(100) slug?: string;
  @IsOptional() @trim() @IsString() @MinLength(30, { message: "The summary needs at least 30 characters" }) @MaxLength(300, { message: "Keep the summary under 300 characters" }) excerpt?: string;
  @IsOptional() @IsString() @MinLength(200, { message: "The article needs at least 200 characters" }) @MaxLength(100_000) content?: string;
  @IsOptional() @trim() @ValidateIf((_, v) => v !== "") @httpsUrl("Cover image") @MaxLength(2000) coverUrl?: string;
  @IsOptional() @trim() @IsString() @MinLength(2) @MaxLength(40) category?: string;
  @IsOptional() @tagsIn() @IsArray() @ArrayMaxSize(8, { message: "Use at most 8 tags" }) @IsString({ each: true }) @MaxLength(30, { each: true }) tags?: string[];
  @IsOptional() @trim() @IsString() @MinLength(2) @MaxLength(80) authorName?: string;
  @IsOptional() @trim() @IsString() @MaxLength(80) authorRole?: string;
  @IsOptional() @trim() @ValidateIf((_, v) => v !== "") @httpsUrl("Author photo") @MaxLength(2000) authorAvatarUrl?: string;
  @IsOptional() @IsBoolean() isPublished?: boolean;
  @IsOptional() @IsBoolean() featured?: boolean;
}

export class ListBlogPostsQueryDto extends PaginationQueryDto {
  /** Searches title, excerpt and category. */
  @IsOptional() @trim() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @trim() @IsIn(["published", "draft"]) status?: string;
  @IsOptional() @trim() @IsString() @MaxLength(40) category?: string;
}

/** GET /saas/public/blog — published posts, newest first. */
export class PublicBlogQueryDto {
  @IsOptional() @trim() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @trim() @IsString() @MaxLength(40) category?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(24) limit?: number;
}
