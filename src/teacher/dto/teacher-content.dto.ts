import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateIf } from "class-validator";
import { LIVE_LIMITS, LIVE_PLATFORMS } from "../../live-classes/live-classes.constants";

const trim = ({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value);

export const TEACHER_LESSON_TYPES = ["VIDEO", "TEXT", "CODING", "QUIZ", "ASSIGNMENT", "LIVE"] as const;
export const LESSON_STATUSES = ["DRAFT", "PUBLISHED"] as const;
const HTTPS = /^https:\/\/[^\s/$.?#][^\s]*$/i;

export class ModuleTitleDto {
  @ApiProperty() @Transform(trim) @IsString() @MinLength(2, { message: "Give the module a title" }) @MaxLength(120, { message: "Keep the title under 120 characters" }) title!: string;
}

export class ReorderDto {
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500) @IsUUID("all", { each: true }) ids!: string[];
}

/** Lesson fields a teacher edits. Partial on update (every field optional), full on create. */
export class TeacherLessonDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID("all", { message: "Choose a module" }) moduleId?: string;
  @ApiProperty() @Transform(trim) @IsString() @MinLength(3, { message: "Give the lesson a title (at least 3 characters)" }) @MaxLength(150, { message: "Keep the title under 150 characters" }) title!: string;
  @ApiProperty({ enum: TEACHER_LESSON_TYPES }) @IsIn(TEACHER_LESSON_TYPES, { message: "Choose a lesson type" }) type!: (typeof TEACHER_LESSON_TYPES)[number];
  @ApiProperty() @Type(() => Number) @IsInt({ message: "Duration must be whole minutes" }) @Min(0) @Max(600, { message: "A lesson can be at most 600 minutes" }) durationMinutes!: number;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @ValidateIf((_, v) => v !== "") @Matches(HTTPS, { message: "Use an https:// video link" }) @MaxLength(1000) videoUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100_000, { message: "The lesson content is too long" }) content?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isPreview?: boolean;
  @ApiProperty({ enum: LESSON_STATUSES }) @IsIn(LESSON_STATUSES) status!: (typeof LESSON_STATUSES)[number];
}

export class TeacherLiveDto {
  @ApiProperty() @IsUUID("all", { message: "Choose a course" }) courseId!: string;
  @ApiProperty() @Transform(trim) @IsString() @MinLength(3, { message: "Give the class a title" }) @MaxLength(LIVE_LIMITS.titleMax, { message: `Keep the title under ${LIVE_LIMITS.titleMax} characters` }) title!: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(LIVE_LIMITS.descriptionMax, { message: `Keep the description under ${LIVE_LIMITS.descriptionMax} characters` }) description?: string;
  @ApiProperty({ example: "2026-11-20" }) @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "Pick a date" }) date!: string;
  @ApiProperty({ example: "19:30" }) @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: "Pick a start time" }) startTime!: string;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(LIVE_LIMITS.minMinutes, { message: `A class must be at least ${LIVE_LIMITS.minMinutes} minutes` }) @Max(LIVE_LIMITS.maxMinutes, { message: "A class can be at most 8 hours" }) durationMinutes!: number;
  @ApiProperty({ enum: LIVE_PLATFORMS }) @IsIn(LIVE_PLATFORMS, { message: "Choose a platform" }) platform!: (typeof LIVE_PLATFORMS)[number];
  @ApiProperty() @Transform(trim) @Matches(HTTPS, { message: "Use an https:// meeting link" }) @MaxLength(500) meetingUrl!: string;
}

export class RecordingDto {
  @ApiProperty() @Transform(trim) @ValidateIf((_, v) => v !== "") @Matches(HTTPS, { message: "Use an https:// recording link" }) @MaxLength(1000) recordingUrl!: string;
}
