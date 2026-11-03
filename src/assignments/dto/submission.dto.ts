import { Transform, Type } from "class-transformer";
import { IsBoolean, IsIn, IsNumber, IsObject, IsOptional, IsString, IsUrl, MaxLength, Min } from "class-validator";
import { PaginationQueryDto } from "../../common/pagination";
import { LIMITS, SUBMISSION_STATUSES } from "../assignments.constants";
import type { SubmissionStatus } from "../assignments.types";

const trim = () => Transform(({ value }) => (typeof value === "string" ? value.trim() : value));
const bool = () => Transform(({ value }) => (value === "true" ? true : value === "false" ? false : value));

export class SubmissionQueryDto extends PaginationQueryDto {
  @IsOptional() @IsIn(SUBMISSION_STATUSES, { message: "status must be GRADED or PENDING" }) status?: SubmissionStatus;
  /** Only late (true) or on-time (false) submissions. */
  @IsOptional() @bool() @IsBoolean() late?: boolean;
  /** Searches student name and email. */
  @IsOptional() @trim() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsIn(["submittedAt", "score", "name"]) sortBy: "submittedAt" | "score" | "name" = "submittedAt";
  @IsOptional() @IsIn(["asc", "desc"]) sortOrder: "asc" | "desc" = "desc";
}

/** Grade Submission modal. The score's upper bound (the assignment's total points) is checked in the service. */
export class GradeSubmissionDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: "Enter a score" })
  @Min(0, { message: "Score can't be negative" })
  score!: number;

  @trim() @IsString() @MaxLength(LIMITS.feedbackMax, { message: `Feedback must be ${LIMITS.feedbackMax} characters or less` }) feedback!: string;

  /** criterionId → points. Each value is checked against that criterion's max in the service. */
  @IsOptional() @IsObject() criterionScores?: Record<string, number>;
}

/** Student answer (multipart: optional `file` + these fields). */
export class SubmitAssignmentDto {
  /** TEXT answers. */
  @IsOptional() @trim() @IsString() @MaxLength(20000, { message: "Your answer must be 20000 characters or less" }) textAnswer?: string;
  /** LINK answers. */
  @IsOptional() @trim() @IsUrl({ protocols: ["http", "https"], require_protocol: true }, { message: "Enter a valid link (https://…)" }) link?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) timeTakenMinutes?: number;
}
