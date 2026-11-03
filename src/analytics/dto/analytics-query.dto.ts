import { IsIn, IsOptional, ValidateBy } from "class-validator";
import { GRANULARITIES, isDateKey } from "../analytics-range";
import type { Granularity, InstructorRankBy, StudentRankBy } from "../analytics.types";

const IsDateKey = (field: string) =>
  ValidateBy({ name: "isDateKey", validator: { validate: (v: unknown) => isDateKey(v), defaultMessage: () => `${field} must be a valid date (YYYY-MM-DD)` } });

/**
 * Reporting period, same keys as the panel URL (`?from=YYYY-MM-DD&to=YYYY-MM-DD`, workspace-local, inclusive).
 * Both omitted = All time (first data day → today, no previous-period comparison).
 */
export class AnalyticsRangeDto {
  @IsOptional() @IsDateKey("from") from?: string;
  @IsOptional() @IsDateKey("to") to?: string;
}

export class RevenueReportQueryDto extends AnalyticsRangeDto {
  /** Trend bucket; falls back to the automatic one when it doesn't suit the range. */
  @IsOptional() @IsIn(GRANULARITIES, { message: "granularity must be day, week or month" }) granularity?: Granularity;
}

export const STUDENT_RANKS = ["completion", "score", "spent"] as const;
export class StudentsReportQueryDto extends AnalyticsRangeDto {
  @IsOptional() @IsIn(STUDENT_RANKS, { message: "studentRank must be completion, score or spent" }) studentRank?: StudentRankBy;
}

export const INSTRUCTOR_RANKS = ["revenue", "enrollments"] as const;
export class CoursesReportQueryDto extends AnalyticsRangeDto {
  @IsOptional() @IsIn(INSTRUCTOR_RANKS, { message: "instructorRank must be revenue or enrollments" }) instructorRank?: InstructorRankBy;
}
