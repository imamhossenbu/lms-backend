import { OmitType, PartialType } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from "class-validator";
import { PaginationQueryDto } from "../../common/pagination";
import { PlainTextLength } from "../../common/validators";
import { COMMUNITY_LIMITS as L, COMMUNITY_SORTS, COMMUNITY_TABS, STUDENT_TABS, TAG_PATTERN, THREAD_CATEGORIES, THREAD_FLAGS } from "../community.constants";
import type { CommunitySort, CommunityTab, ThreadCategory, ThreadFlag } from "../community.types";

const trim = () => Transform(({ value }) => (typeof value === "string" ? value.trim() : value));
const tagList = () =>
  Transform(({ value }) => (Array.isArray(value) ? Array.from(new Set(value.map((t) => (typeof t === "string" ? t.trim().toLowerCase() : t)))) : value));
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Fields a student may write (New Discussion form without moderation toggles). */
export class StudentThreadDto {
  @trim()
  @IsString({ message: "Title must be at least 8 characters" })
  @MinLength(L.titleMin, { message: "Title must be at least 8 characters" })
  @MaxLength(L.titleMax, { message: `Title must be ${L.titleMax} characters or less` })
  title!: string;

  @IsIn(THREAD_CATEGORIES, { message: "Choose a discussion type" }) category!: ThreadCategory;

  @IsUUID("all", { message: "Select a course" }) courseId!: string;

  /** "" = course-wide. */
  @IsString({ message: "Select a module" })
  @ValidateIf((o) => o.moduleId !== "")
  @IsUUID("all", { message: "Select a module" })
  moduleId!: string;

  @PlainTextLength(L.bodyMin, L.bodyMax, "Write at least 20 characters", `Keep it under ${L.bodyMax} characters`) bodyHtml!: string;

  @tagList()
  @IsArray({ message: `Up to ${L.tagsMax} tags` })
  @ArrayMaxSize(L.tagsMax, { message: `Up to ${L.tagsMax} tags` })
  @ArrayUnique()
  @IsString({ each: true, message: "Use letters, numbers and dashes" })
  @MinLength(L.tagMin, { each: true, message: "Tags need at least 2 characters" })
  @MaxLength(L.tagMax, { each: true, message: "Tags must be 24 characters or less" })
  @Matches(TAG_PATTERN, { each: true, message: "Use letters, numbers and dashes" })
  tags!: string[];
}

export class UpdateStudentThreadDto extends PartialType(StudentThreadDto) {}

/** New / Edit Discussion form (= panel threadFormSchema). */
export class CreateThreadDto extends StudentThreadDto {
  @IsBoolean() isPinned!: boolean;
  @IsBoolean() isLocked!: boolean;
}

export class UpdateThreadDto extends PartialType(CreateThreadDto) {}

/** Pin / lock / hide (any subset). */
export class ThreadFlagsDto {
  @IsOptional() @IsBoolean() isPinned?: boolean;
  @IsOptional() @IsBoolean() isLocked?: boolean;
  @IsOptional() @IsBoolean() isHidden?: boolean;
}

export class BulkIdsDto {
  @IsArray()
  @ArrayMinSize(1, { message: "Select at least one discussion" })
  @ArrayMaxSize(L.bulkMax, { message: `Select up to ${L.bulkMax} discussions at a time` })
  @IsUUID("all", { each: true, message: "Each id must be a valid id" })
  ids!: string[];
}

export class BulkFlagDto extends BulkIdsDto {
  @IsIn(THREAD_FLAGS, { message: "flag must be isPinned, isLocked or isHidden" }) flag!: ThreadFlag;
  @IsBoolean() value!: boolean;
}

/** Admin list: tab + filters + sort + page (all mirrored in the panel URL). */
export class ThreadQueryDto extends PaginationQueryDto {
  @IsOptional() @IsIn(COMMUNITY_TABS) tab: CommunityTab = "all";
  @IsOptional() @IsIn(COMMUNITY_SORTS) sort: CommunitySort = "activity";
  /** Searches title, body, author, tags and course title. A leading "#" is ignored. */
  @IsOptional() @trim() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsUUID("all", { message: "courseId must be a valid id" }) courseId?: string;
  @IsOptional() @IsIn(THREAD_CATEGORIES) category?: ThreadCategory;
  /** "YYYY-MM-DD" range on last activity. */
  @IsOptional() @Matches(DATE, { message: "from must be YYYY-MM-DD" }) from?: string;
  @IsOptional() @Matches(DATE, { message: "to must be YYYY-MM-DD" }) to?: string;
}

/** Student list of one course (no moderation / hidden tabs, no course filter). */
export class StudentThreadQueryDto extends OmitType(ThreadQueryDto, ["tab", "courseId"] as const) {
  @IsOptional() @IsIn(STUDENT_TABS) tab: CommunityTab = "all";
}

/** Duplicate check while typing a title. */
export class SimilarQueryDto {
  @trim() @IsString() @MaxLength(L.titleMax) title!: string;
  @IsUUID("all", { message: "Select a course" }) courseId!: string;
  @IsOptional() @IsUUID("all") excludeId?: string;
}
