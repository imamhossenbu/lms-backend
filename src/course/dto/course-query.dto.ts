import { IsOptional, IsString, IsNumber, IsBoolean } from "class-validator";
import { Type, Transform } from "class-transformer";
import { ApiPropertyOptional } from "@nestjs/swagger";

export class CourseQueryDto {
  @ApiPropertyOptional({ description: "Search query for title and description" })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: "Category ID to filter by" })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({ description: "Course level (e.g. Beginner, Intermediate, Advanced)" })
  @IsOptional()
  @IsString()
  level?: string;

  @ApiPropertyOptional({ description: "Filter for free courses only" })
  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  isFree?: boolean;

  @ApiPropertyOptional({ description: "Minimum course price" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minPrice?: number;

  @ApiPropertyOptional({ description: "Maximum course price" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxPrice?: number;

  @ApiPropertyOptional({ description: "Course status (DRAFT, PUBLISHED, ARCHIVED)" })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: "Page number (defaults to 1)" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number = 1;

  @ApiPropertyOptional({ description: "Number of courses per page (defaults to 10)" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number = 10;

  @ApiPropertyOptional({
    description: "Sort order: newest, priceAsc, priceDesc, popular, rating",
    enum: ["newest", "priceAsc", "priceDesc", "popular", "rating"],
  })
  @IsOptional()
  @IsString()
  sortBy?: "newest" | "priceAsc" | "priceDesc" | "popular" | "rating" = "newest";
}
