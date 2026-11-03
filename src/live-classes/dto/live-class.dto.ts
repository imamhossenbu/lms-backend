import { PartialType } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUrl, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateIf, ValidateNested } from "class-validator";
import { PaginationQueryDto } from "../../common/pagination";
import { PlainTextLength } from "../../common/validators";
import {
  ATTENDANCE_STATUSES,
  DISPLAY_STATUSES,
  LIVE_LIMITS as L,
  LIVE_PLATFORMS,
  LIVE_TYPES,
  REMINDER_OFFSETS,
  RESOURCE_TYPES,
  RESOURCE_VISIBILITIES,
} from "../live-classes.constants";
import type {
  AttendanceStatus,
  LiveClassType,
  LiveDisplayStatus,
  LivePlatform,
  LiveQuestionStatus,
  LiveResourceType,
  LiveResourceVisibility,
  ReminderOffset,
} from "../live-classes.types";

const trim = () => Transform(({ value }) => (typeof value === "string" ? value.trim() : value));
const bool = () => Transform(({ value }) => (value === "true" ? true : value === "false" ? false : value));
const HTTP_URL = { protocols: ["http", "https"], require_protocol: true, require_tld: false };
const URL_MSG = { message: "Enter a valid URL starting with https://" };

export class LiveClassSettingsDto {
  @IsBoolean() allowQa!: boolean;
  @IsBoolean() enableChat!: boolean;
  @IsBoolean() recordClass!: boolean;
  @IsBoolean() makePublic!: boolean;
  @IsBoolean() sendReminder!: boolean;
  @IsBoolean() autoAttendance!: boolean;
}

/** Schedule Live Class form. */
export class CreateLiveClassDto {
  @trim()
  @IsString()
  @MinLength(3, { message: "Class title must be at least 3 characters" })
  @MaxLength(L.titleMax, { message: `Title must be ${L.titleMax} characters or less` })
  title!: string;

  @IsUUID("all", { message: "Select a course" }) courseId!: string;
  @IsUUID("all", { message: "Select an instructor" }) instructorId!: string;
  @IsIn(LIVE_TYPES) type!: LiveClassType;
  @PlainTextLength(0, L.descriptionMax, "", `Description must be ${L.descriptionMax} characters or less`) descriptionHtml!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "Select a date" }) date!: string;
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: "Select a start time" }) startTime!: string;
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: "Select an end time" }) endTime!: string;
  @IsIn(LIVE_PLATFORMS) platform!: LivePlatform;
  @trim() @IsUrl(HTTP_URL, URL_MSG) @MaxLength(2000) meetingLink!: string;
  @trim() @IsString() @MaxLength(40, { message: "Too long" }) meetingId!: string;
  @trim() @IsString() @MaxLength(40, { message: "Too long" }) passcode!: string;
  @IsBoolean() sendLinkToStudents!: boolean;
  @IsInt({ message: "Whole numbers only" }) @Min(1, { message: "At least 1 seat" }) @Max(L.capacityMax, { message: "Up to 10,000 seats" }) capacity!: number;
  @ValidateNested() @Type(() => LiveClassSettingsDto) settings!: LiveClassSettingsDto;
  @IsIn(REMINDER_OFFSETS) reminder!: ReminderOffset;
  /** Uploaded image URL or "". */
  @ValidateIf((o) => o.thumbnailUrl !== "") @IsUrl(HTTP_URL, URL_MSG) @MaxLength(2000) thumbnailUrl!: string;
}

export class UpdateLiveClassDto extends PartialType(CreateLiveClassDto) {}

export class LiveClassQueryDto extends PaginationQueryDto {
  @IsOptional() @IsUUID("all", { message: "courseId must be a valid id" }) courseId?: string;
  @IsOptional() @IsUUID("all", { message: "instructorId must be a valid id" }) instructorId?: string;
  @IsOptional() @IsIn(DISPLAY_STATUSES) status?: LiveDisplayStatus;
  @IsOptional() @IsIn(LIVE_TYPES) type?: LiveClassType;
  /** Searches the title. */
  @IsOptional() @trim() @IsString() @MaxLength(100) q?: string;
  /** "YYYY-MM-DD" range on the class day. */
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "from must be YYYY-MM-DD" }) from?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "to must be YYYY-MM-DD" }) to?: string;
  @IsOptional() @IsIn(["startTime", "createdAt", "title"]) sortBy: "startTime" | "createdAt" | "title" = "startTime";
  @IsOptional() @IsIn(["asc", "desc"]) sortOrder: "asc" | "desc" = "desc";
}

export class LiveStatsQueryDto {
  @IsOptional() @IsUUID("all", { message: "courseId must be a valid id" }) courseId?: string;
}

export class AttendanceQueryDto extends PaginationQueryDto {
  @IsOptional() @IsIn(ATTENDANCE_STATUSES) status?: AttendanceStatus;
  @IsOptional() @trim() @IsString() @MaxLength(100) q?: string;
}

export class SetAttendanceDto {
  @IsIn(ATTENDANCE_STATUSES, { message: "status must be ATTENDED, ABSENT or NOT_JOINED" }) status!: AttendanceStatus;
}

export class RemindDto {
  /** Only students who haven't joined (yet). */
  @IsOptional() @bool() @IsBoolean() onlyNotJoined?: boolean;
}

// ---------------------------------------------------------------- Q&A

export class QuestionQueryDto extends PaginationQueryDto {
  @IsOptional() @IsIn(["ANSWERED", "PENDING"]) status?: LiveQuestionStatus;
}

export class AnswerQuestionDto {
  @IsString() @MaxLength(20_000) answerHtml!: string;
  @IsIn(["ANSWERED", "PENDING"]) status!: LiveQuestionStatus;
}

export class AskQuestionDto {
  @trim() @IsString() @MinLength(3, { message: "Write your question" }) @MaxLength(L.questionMax, { message: `Questions must be ${L.questionMax} characters or less` })
  question!: string;
}

// ---------------------------------------------------------------- resources

export class LiveResourceDto {
  @IsIn(RESOURCE_TYPES) type!: LiveResourceType;
  @trim() @IsString() @MinLength(2, { message: "Title is required" }) @MaxLength(120, { message: "120 characters or less" }) title!: string;
  @trim() @IsString() @MaxLength(200, { message: "200 characters or less" }) description!: string;
  @trim() @IsUrl(HTTP_URL, URL_MSG) @MaxLength(2000) url!: string;
  @IsInt() @Min(0) size!: number;
  @IsIn(RESOURCE_VISIBILITIES) visibility!: LiveResourceVisibility;
}

export class UpdateLiveResourceDto extends PartialType(LiveResourceDto) {}
