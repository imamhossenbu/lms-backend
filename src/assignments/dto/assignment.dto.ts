import { ApiProperty, PartialType } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateBy,
  ValidateNested,
  type ValidationOptions,
} from "class-validator";
import { plainTextLength } from "../../common/html";
import { PaginationQueryDto } from "../../common/pagination";
import {
  ASSIGNMENT_STATUSES,
  ASSIGNMENT_TYPES,
  AVAILABILITY_MODES,
  DIFFICULTIES,
  ESTIMATED_UNITS,
  GRADE_DISPLAYS,
  GRADING_TYPES,
  LATE_POLICIES,
  LIMITS,
  PENALTY_UNITS,
  RUBRIC_TONES,
} from "../assignments.constants";
import type {
  AssignmentDifficulty,
  AssignmentStatus,
  AssignmentType,
  AvailabilityMode,
  EstimatedUnit,
  GradeDisplay,
  GradingType,
  LateSubmissionPolicy,
  PenaltyUnit,
  RubricLevelTone,
} from "../assignments.types";

const trim = () => Transform(({ value }) => (typeof value === "string" ? value.trim() : value));
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const OPTIONAL_DATE_RE = /^$|^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const OPTIONAL_TIME_RE = /^$|^([01]\d|2[0-3]):[0-5]\d$/;
const CLIENT_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** Visible-text length of rich-text HTML must be within [min, max]. */
function PlainTextLength(min: number, max: number, tooShort: string, tooLong: string, options?: ValidationOptions) {
  return ValidateBy(
    {
      name: "plainTextLength",
      validator: {
        validate: (v: unknown) => typeof v === "string" && plainTextLength(v) >= min && plainTextLength(v) <= max,
        defaultMessage: (args) => (typeof args?.value === "string" && plainTextLength(args.value) > max ? tooLong : tooShort),
      },
    },
    options,
  );
}

// ---------------------------------------------------------------- nested parts

export class AttachmentDto {
  @Matches(CLIENT_ID_RE, { message: "Attachment id is invalid" }) id!: string;
  @trim() @IsString() @MinLength(1, { message: "Attachment name is required" }) @MaxLength(200) name!: string;
  @IsUrl({ protocols: ["http", "https"], require_protocol: true, require_tld: false }, { message: "Attachment must be an uploaded file URL" })
  @MaxLength(2000)
  url!: string;
  @IsInt() @Min(0) size!: number;
  @IsString() @MaxLength(10) format!: string;
}

export class RubricLevelDto {
  @Matches(CLIENT_ID_RE, { message: "Level id is invalid" }) id!: string;
  @IsIn(RUBRIC_TONES) tone!: RubricLevelTone;
  @trim() @IsString() @MinLength(2, { message: "Level name is required" }) @MaxLength(40, { message: "40 characters or less" }) label!: string;
  @IsInt({ message: "Whole numbers only" }) @Min(0, { message: "Can't be negative" }) @Max(LIMITS.maxPoints, { message: "Too many points" }) points!: number;
  @trim() @IsString() @MinLength(3, { message: "Describe this level" }) @MaxLength(200, { message: "200 characters or less" }) description!: string;
}

export class RubricCriterionDto {
  @Matches(CLIENT_ID_RE, { message: "Criterion id is invalid" }) id!: string;
  @trim() @IsString() @MinLength(2, { message: "Criterion name is required" }) @MaxLength(80, { message: "80 characters or less" }) title!: string;
  @trim() @IsString() @MaxLength(200, { message: "200 characters or less" }) description!: string;
  @IsInt({ message: "Whole numbers only" }) @Min(1, { message: "At least 1 point" }) @Max(LIMITS.maxPoints, { message: "Too many points" }) points!: number;

  @IsArray()
  @ArrayMinSize(2, { message: "Add at least 2 levels" })
  @ArrayMaxSize(5, { message: "Up to 5 levels" })
  @ValidateNested({ each: true })
  @Type(() => RubricLevelDto)
  levels!: RubricLevelDto[];
}

export class RubricDto {
  @IsBoolean() enabled!: boolean;
  /** Required only when the rubric is enabled (checked in assignment-rules). */
  @trim() @IsString() @MaxLength(LIMITS.rubricTitleMax, { message: `${LIMITS.rubricTitleMax} characters or less` }) title!: string;
  /** Always equals the assignment's total points; kept for the panel's shape. */
  @IsOptional() @IsInt() totalPoints?: number;
  @trim() @IsString() @MaxLength(LIMITS.rubricDescriptionMax, { message: `${LIMITS.rubricDescriptionMax} characters or less` }) description!: string;
  @IsBoolean() visibleToStudents!: boolean;

  @IsArray()
  @ArrayMaxSize(LIMITS.maxCriteria, { message: `Up to ${LIMITS.maxCriteria} criteria` })
  @ValidateNested({ each: true })
  @Type(() => RubricCriterionDto)
  criteria!: RubricCriterionDto[];
}

const bulletList = () => [IsArray(), ArrayMaxSize(20), IsString({ each: true }), MaxLength(500, { each: true })];
const applyAll = (decorators: PropertyDecorator[]): PropertyDecorator => (target, key) => decorators.forEach((d) => d(target, key));

export class InstructionsDto {
  @IsString() @MaxLength(LIMITS.shortDescriptionMax) overview!: string;
  @applyAll(bulletList()) objectives!: string[];
  @applyAll(bulletList()) tasks!: string[];
  @applyAll(bulletList()) requirements!: string[];

  @IsArray()
  @ArrayMaxSize(LIMITS.maxFileTypes, { message: `Up to ${LIMITS.maxFileTypes} file types` })
  @Matches(/^\.[a-z0-9]+$/, { each: true, message: "Use a file extension like .pdf" })
  allowedFileTypes!: string[];

  @IsInt() @Min(1, { message: "At least 1 MB" }) @Max(500, { message: "500 MB or less" }) maxFileSizeMb!: number;
  @applyAll(bulletList()) gradingNotes!: string[];
}

export class AiGradingDto {
  @IsBoolean() enabled!: boolean;
  @trim() @IsString() @MaxLength(LIMITS.aiCriteriaMax, { message: `${LIMITS.aiCriteriaMax} characters or less` }) criteria!: string;
}

// ---------------------------------------------------------------- create / update

/** Body of POST /admin/assignments — the panel's `wizardToAssignment()` output, plus an optional status. */
export class CreateAssignmentDto {
  @IsUUID("all", { message: "Select a course" }) courseId!: string;

  @trim()
  @IsString()
  @MinLength(3, { message: "Title must be at least 3 characters" })
  @MaxLength(LIMITS.titleMax, { message: `Title must be ${LIMITS.titleMax} characters or less` })
  title!: string;

  @PlainTextLength(
    LIMITS.shortDescriptionMin,
    LIMITS.shortDescriptionMax,
    `Short description must be at least ${LIMITS.shortDescriptionMin} characters`,
    `Short description must be ${LIMITS.shortDescriptionMax} characters or less`,
  )
  descriptionHtml!: string;

  @IsUUID("all", { message: "Select a module" }) moduleId!: string;
  /** "" = not tied to a lesson. */
  @IsString() @Matches(/^$|^[0-9a-f-]{36}$/i, { message: "lessonId must be a valid id" }) lessonId!: string;

  @IsIn(ASSIGNMENT_TYPES, { message: "Select an assignment type" }) type!: AssignmentType;
  @Matches(DATE_RE, { message: "Pick a due date" }) dueDate!: string;
  @Matches(TIME_RE, { message: "Pick a due time" }) dueTime!: string;

  @IsInt({ message: "Whole numbers only" })
  @Min(1, { message: "At least 1 point" })
  @Max(LIMITS.maxPoints, { message: `${LIMITS.maxPoints} points or less` })
  totalPoints!: number;

  @ApiProperty({ example: "UNLIMITED", description: '"UNLIMITED" or "1"…"10"' })
  @Matches(/^(UNLIMITED|[1-9]|10)$/, { message: "Attempts must be UNLIMITED or 1–10" })
  attempts!: string;

  @IsIn(LATE_POLICIES) lateSubmission!: LateSubmissionPolicy;
  @IsIn(GRADING_TYPES) gradingType!: GradingType;
  @IsBoolean() showRubric!: boolean;
  @IsBoolean() peerReview!: boolean;

  @IsArray()
  @ArrayMaxSize(LIMITS.maxAttachments, { message: `Add up to ${LIMITS.maxAttachments} attachments` })
  @ValidateNested({ each: true })
  @Type(() => AttachmentDto)
  attachments!: AttachmentDto[];

  @ValidateNested() @Type(() => InstructionsDto) instructions!: InstructionsDto;
  @ValidateNested() @Type(() => RubricDto) rubric!: RubricDto;

  @trim() @IsString() @MaxLength(40) category!: string;
  @IsIn(DIFFICULTIES) difficulty!: AssignmentDifficulty;
  @IsNumber({}, { message: "Enter a number" }) @Min(0, { message: "Can't be negative" }) @Max(1000, { message: "Too long" }) estimatedTime!: number;
  @IsIn(ESTIMATED_UNITS) estimatedUnit!: EstimatedUnit;

  @PlainTextLength(
    LIMITS.instructionsMin,
    LIMITS.instructionsMax,
    `Instructions must be at least ${LIMITS.instructionsMin} characters`,
    `Instructions must be ${LIMITS.instructionsMax} characters or less`,
  )
  instructionsHtml!: string;

  @IsInt() @Min(1, { message: "At least 1 file" }) @Max(10, { message: "Up to 10 files" }) maxFiles!: number;
  @IsNumber({}, { message: "Enter a penalty" }) @Min(0, { message: "Can't be negative" }) @Max(LIMITS.maxPoints) latePenalty!: number;
  @IsIn(PENALTY_UNITS) latePenaltyUnit!: PenaltyUnit;

  /** null = no passing score. */
  @IsOptional() @IsInt({ message: "Whole numbers only" }) @Min(0, { message: "Can't be negative" }) passingScore!: number | null;

  @IsIn(GRADE_DISPLAYS) gradeDisplay!: GradeDisplay;
  @ValidateNested() @Type(() => AiGradingDto) aiGrading!: AiGradingDto;
  @IsBoolean() manualOverride!: boolean;

  @Matches(DATE_RE, { message: "Pick a release date" }) releaseDate!: string;
  @Matches(TIME_RE, { message: "Pick a release time" }) releaseTime!: string;
  @IsIn(AVAILABILITY_MODES) availability!: AvailabilityMode;
  @IsInt({ message: "Whole minutes only" }) @Min(5, { message: "At least 5 minutes" }) @Max(10080, { message: "Up to 7 days" }) timeLimitMinutes!: number;
  @Matches(OPTIONAL_DATE_RE, { message: "Pick a valid date" }) windowStartDate!: string;
  @Matches(OPTIONAL_TIME_RE, { message: "Pick a valid time" }) windowStartTime!: string;
  @Matches(OPTIONAL_DATE_RE, { message: "Pick a valid date" }) windowEndDate!: string;
  @Matches(OPTIONAL_TIME_RE, { message: "Pick a valid time" }) windowEndTime!: string;
  @IsBoolean() showInCalendar!: boolean;

  /** "Create Assignment" publishes; "Save as draft" sends DRAFT. */
  @IsOptional() @IsIn(ASSIGNMENT_STATUSES) status?: AssignmentStatus;
}

/**
 * Body of PATCH /admin/assignments/:id — any subset (status toggle, Rubric tab, Instructions editor, full wizard edit).
 * The course can't change; cross-field rules run on the merged result.
 */
export class UpdateAssignmentDto extends PartialType(CreateAssignmentDto) {}

// ---------------------------------------------------------------- lists

export class AssignmentQueryDto extends PaginationQueryDto {
  /** Only this course's assignments (the Course › Assignments tab). */
  @IsOptional() @IsUUID("all", { message: "courseId must be a valid id" }) courseId?: string;
  @IsOptional() @IsUUID("all", { message: "moduleId must be a valid id" }) moduleId?: string;
  /** Searches the title. */
  @IsOptional() @trim() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsIn(ASSIGNMENT_STATUSES) status?: AssignmentStatus;
  @IsOptional() @IsIn(ASSIGNMENT_TYPES) type?: AssignmentType;
  @IsOptional() @IsIn(["dueDate", "createdAt", "title"]) sortBy: "dueDate" | "createdAt" | "title" = "createdAt";
  @IsOptional() @IsIn(["asc", "desc"]) sortOrder: "asc" | "desc" = "desc";
}

export class AssignmentStatsQueryDto {
  @IsOptional() @IsUUID("all", { message: "courseId must be a valid id" }) courseId?: string;
}
