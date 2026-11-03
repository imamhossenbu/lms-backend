import { Transform, Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested } from "class-validator";
import { PaginationQueryDto } from "../../common/pagination";
import { QUIZ_LIMITS } from "../quizzes.constants";

const trim = () => Transform(({ value }) => (typeof value === "string" ? value.trim() : value));
const bool = () => Transform(({ value }) => (value === "true" ? true : value === "false" ? false : value));

export class AttemptQueryDto extends PaginationQueryDto {
  @IsOptional() @bool() @IsBoolean() passed?: boolean;
  @IsOptional() @bool() @IsBoolean() completed?: boolean;
  /** Searches student name and email. */
  @IsOptional() @trim() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsIn(["submittedAt", "score", "timeTakenSeconds"]) sortBy: "submittedAt" | "score" | "timeTakenSeconds" = "submittedAt";
  @IsOptional() @IsIn(["asc", "desc"]) sortOrder: "asc" | "desc" = "desc";
}

export class StudentAnswerDto {
  @IsString() @MaxLength(64) questionId!: string;
  /** Picked options (choice questions). */
  @IsOptional() @IsArray() @ArrayMaxSize(QUIZ_LIMITS.optionsMax) @Matches(/^[A-Za-z0-9_-]{1,64}$/, { each: true }) optionIds?: string[];
  /** Typed answer (SHORT_ANSWER). */
  @IsOptional() @IsString() @MaxLength(200, { message: "Answers must be 200 characters or less" }) text?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(86_400) timeSeconds?: number;
}

/** Student finishes a quiz. */
export class SubmitQuizDto {
  @IsArray() @ArrayMaxSize(QUIZ_LIMITS.questionsMax) @ValidateNested({ each: true }) @Type(() => StudentAnswerDto) answers!: StudentAnswerDto[];
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(86_400) timeTakenSeconds?: number;
}
