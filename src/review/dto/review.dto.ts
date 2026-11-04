import { Transform, Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from "class-validator";

const trim = () => Transform(({ value }) => (typeof value === "string" ? value.trim() : value));

/** Student review. status / userId are always set by the server. */
export class CreateReviewDto {
  @IsUUID("all", { message: "courseId must be a valid id" })
  courseId!: string;

  @Type(() => Number)
  @IsInt({ message: "Rating must be a whole number" })
  @Min(1, { message: "Rating must be between 1 and 5" })
  @Max(5, { message: "Rating must be between 1 and 5" })
  rating!: number;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(2000, { message: "Review must be 2000 characters or less" })
  reviewText?: string;
}

export class UpdateReviewDto {
  @Type(() => Number)
  @IsInt({ message: "Rating must be a whole number" })
  @Min(1, { message: "Rating must be between 1 and 5" })
  @Max(5, { message: "Rating must be between 1 and 5" })
  rating!: number;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(2000, { message: "Review must be 2000 characters or less" })
  reviewText?: string;
}

export class ReviewStatusDto {
  @IsIn(["APPROVED", "REJECTED"], { message: "status must be APPROVED or REJECTED" })
  status!: "APPROVED" | "REJECTED";
}
