import { OmitType, PartialType } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { PaginationQueryDto } from "../../common/pagination";
import { PlainTextLength } from "../../common/validators";
import { QUESTION_KINDS, QUIZ_ACCESS, QUIZ_DIFFICULTIES, QUIZ_LIMITS as L, QUIZ_STATUSES } from "../quizzes.constants";
import type { QuizAccess, QuizDifficulty, QuizQuestionKind, QuizStatus } from "../quizzes.types";

const trim = () => Transform(({ value }) => (typeof value === "string" ? value.trim() : value));
const CLIENT_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const OPTIONAL_DATE_RE = /^$|^\d{4}-\d{2}-\d{2}$/;

export class QuizOptionDto {
  @Matches(CLIENT_ID_RE, { message: "Option id is invalid" }) id!: string;
  @trim() @IsString() @MinLength(1, { message: "Option can't be empty" }) @MaxLength(L.optionMax, { message: `${L.optionMax} characters or less` }) text!: string;
}

export class QuizQuestionDto {
  /** Existing question id (kept on edit) or a client id like "q-abc" for new ones. */
  @Matches(CLIENT_ID_RE, { message: "Question id is invalid" }) id!: string;
  @IsIn(QUESTION_KINDS) kind!: QuizQuestionKind;
  @PlainTextLength(L.questionMin, L.questionMax, "Write the question", `Question must be ${L.questionMax} characters or less`) questionHtml!: string;

  @IsArray() @ArrayMaxSize(L.optionsMax, { message: `Up to ${L.optionsMax} options` }) @ValidateNested({ each: true }) @Type(() => QuizOptionDto)
  options!: QuizOptionDto[];

  @IsArray() @ArrayMaxSize(L.optionsMax) @IsString({ each: true }) correctOptionIds!: string[];

  @IsArray() @ArrayMaxSize(L.acceptedMax, { message: `Up to ${L.acceptedMax} accepted answers` }) @IsString({ each: true }) @MaxLength(200, { each: true })
  acceptedAnswers!: string[];

  @PlainTextLength(0, L.explanationMax, "", `Explanation must be ${L.explanationMax} characters or less`) explanationHtml!: string;
  @IsInt({ message: "Whole numbers only" }) @Min(1, { message: "At least 1 point" }) @Max(L.pointsMax, { message: `${L.pointsMax} points or less` }) points!: number;

  @IsOptional() @IsInt({ message: "Whole seconds only" }) @Min(5, { message: "At least 5 seconds" }) @Max(3600, { message: "Up to 1 hour" })
  timeLimitSeconds!: number | null;

  @IsBoolean() required!: boolean;
  @IsBoolean() shuffleOptions!: boolean;
}

/** Body of POST /admin/quizzes — the panel's `wizardToQuiz()` output plus a status. */
export class CreateQuizDto {
  @trim()
  @IsString()
  @MinLength(3, { message: "Quiz title must be at least 3 characters" })
  @MaxLength(L.titleMax, { message: `Title must be ${L.titleMax} characters or less` })
  title!: string;

  @IsUUID("all", { message: "Select a course" }) courseId!: string;
  /** Not needed with `lessonId`: the lesson's module is used. */
  @ValidateIf((o: CreateQuizDto) => !o.lessonId) @IsUUID("all", { message: "Select a module" }) moduleId!: string;
  /** Attaches the quiz to a lesson of the course (one quiz per lesson). */
  @IsOptional() @IsUUID("all", { message: "lessonId must be a valid id" }) lessonId?: string;
  @IsIn(QUIZ_DIFFICULTIES) difficulty!: QuizDifficulty;

  @PlainTextLength(L.descriptionMin, L.descriptionMax, `Description must be at least ${L.descriptionMin} characters`, `Description must be ${L.descriptionMax} characters or less`)
  descriptionHtml!: string;

  @PlainTextLength(0, L.instructionsMax, "", `Instructions must be ${L.instructionsMax} characters or less`) instructionsHtml!: string;

  @IsArray()
  @ArrayMaxSize(L.questionsMax, { message: `Up to ${L.questionsMax} questions` })
  @ValidateNested({ each: true })
  @Type(() => QuizQuestionDto)
  questions!: QuizQuestionDto[];

  @IsInt({ message: "Whole numbers only" }) @Min(1, { message: "At least 1 mark" }) passingMarks!: number;

  @IsOptional() @IsInt({ message: "Whole minutes only" }) @Min(1, { message: "At least 1 minute" }) @Max(L.timeLimitMinutesMax, { message: `Up to ${L.timeLimitMinutesMax} minutes` })
  timeLimitMinutes!: number | null;

  @Matches(/^(UNLIMITED|[1-9]|10)$/, { message: "Select the number of attempts" }) maxAttempts!: string;
  @IsBoolean() showCorrectAnswers!: boolean;
  @IsBoolean() showExplanation!: boolean;
  @IsBoolean() randomizeQuestions!: boolean;
  @IsBoolean() randomizeOptions!: boolean;
  @Matches(OPTIONAL_DATE_RE, { message: "Pick a valid date" }) startDate!: string;
  @Matches(OPTIONAL_DATE_RE, { message: "Pick a valid date" }) endDate!: string;
  @IsIn(QUIZ_ACCESS) access!: QuizAccess;
  @IsBoolean() requirePreviousLessons!: boolean;
  @IsBoolean() showImmediately!: boolean;

  /** "Publish" or "Save as Draft". */
  @IsOptional() @IsIn(["PUBLISHED", "DRAFT"]) status?: "PUBLISHED" | "DRAFT";
}

/** PATCH /admin/quizzes/:id — any subset, including a status change (publish / unpublish / archive). */
export class UpdateQuizDto extends PartialType(OmitType(CreateQuizDto, ["status"] as const)) {
  @IsOptional() @IsIn(QUIZ_STATUSES) status?: QuizStatus;
}

export class QuizQueryDto extends PaginationQueryDto {
  @IsOptional() @IsUUID("all", { message: "courseId must be a valid id" }) courseId?: string;
  @IsOptional() @IsUUID("all", { message: "moduleId must be a valid id" }) moduleId?: string;
  @IsOptional() @IsUUID("all", { message: "lessonId must be a valid id" }) lessonId?: string;
  /** Searches the title. */
  @IsOptional() @trim() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsIn(QUIZ_STATUSES) status?: QuizStatus;
  @IsOptional() @IsIn(QUIZ_DIFFICULTIES) difficulty?: QuizDifficulty;
  @IsOptional() @IsIn(["createdAt", "updatedAt", "title"]) sortBy: "createdAt" | "updatedAt" | "title" = "createdAt";
  @IsOptional() @IsIn(["asc", "desc"]) sortOrder: "asc" | "desc" = "desc";
}

export class QuizStatsQueryDto {
  @IsOptional() @IsUUID("all", { message: "courseId must be a valid id" }) courseId?: string;
}
