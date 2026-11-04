import { IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";
import { Transform } from "class-transformer";

const STATUSES = ["ACTIVE", "INACTIVE"] as const;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const trim = ({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value);

export class CreateCategoryDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name!: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  @Matches(SLUG, { message: "Slug can only contain lowercase letters, numbers and single hyphens." })
  slug!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  /** Icon id ("code", "design"…), an emoji or an image URL. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  icon?: string;

  /** Defaults to ACTIVE. */
  @IsOptional()
  @IsIn(STATUSES)
  status?: string;
}

export class UpdateCategoryDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  @Matches(SLUG, { message: "Slug can only contain lowercase letters, numbers and single hyphens." })
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  icon?: string;

  @IsOptional()
  @IsIn(STATUSES)
  status?: string;
}
