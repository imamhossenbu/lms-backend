import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import { IsEmail, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from "class-validator";

export const ACADEMY_COURSE_SORTS = ["popular", "newest", "rating", "priceAsc", "priceDesc"] as const;
export type AcademyCourseSort = (typeof ACADEMY_COURSE_SORTS)[number];

/** `?host=` for GET /academy/public/resolve (custom domain or <slug>.<root domain>). */
export class ResolveAcademyQueryDto {
  @ApiPropertyOptional({ description: "Request host, e.g. learn.example.com or abc.edupro.com" })
  @IsString()
  @MaxLength(253)
  @Matches(/^[a-z0-9.-]+(:\d+)?$/i, { message: "host must be a domain name" })
  host!: string;
}

/** Public course catalogue filters (published courses only). */
export class AcademyCoursesQueryDto {
  @ApiPropertyOptional({ description: "Search title, summary and tags" })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ description: "Category slug" })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  category?: string;

  @ApiPropertyOptional({ description: "Level, e.g. Beginner / Intermediate / Advanced" })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  level?: string;

  @ApiPropertyOptional({ enum: ["free", "paid"] })
  @IsOptional()
  @IsIn(["free", "paid"])
  price?: "free" | "paid";

  @ApiPropertyOptional({ description: "Instructor id" })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  instructor?: string;

  @ApiPropertyOptional({ enum: ACADEMY_COURSE_SORTS })
  @IsOptional()
  @IsIn(ACADEMY_COURSE_SORTS)
  sort?: AcademyCourseSort;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 12 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(48)
  limit?: number;
}

export class AcademyReviewsQueryDto {
  @ApiPropertyOptional({ default: 6 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24)
  limit?: number;
}

/** Newsletter sign-up. `website` is a honeypot: real visitors never fill it. */
export class NewsletterDto {
  @ApiPropertyOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: "Enter a valid email address" })
  @MaxLength(120)
  email!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional({ description: "home | footer | about …" })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  source?: string;

  @ApiPropertyOptional({ description: "Honeypot — leave empty" })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;
}
