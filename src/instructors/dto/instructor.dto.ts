import { Transform } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
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
import { IsSocialLinks, type SocialLinks } from "./social-links.validator";
import { INSTRUCTOR_STATUS_LABELS, NOTE_PRIORITIES, NOTE_TYPES } from "../instructors.constants";
import type { InstructorNoteType, InstructorStatusLabel, NotePriority } from "../instructors.types";

const trim = () => Transform(({ value }) => (typeof value === "string" ? value.trim() : value));
const trimLower = () => Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value));
/** Same rule as the panel: optional, 8–20 digits / spaces / dashes, optional leading +. */
const PHONE_RE = /^$|^\+?[\d\s-]{8,20}$/;

// ---------------------------------------------------------------- list

export class InstructorQueryDto extends PaginationQueryDto {
  /** Searches name, email, title and expertise. */
  @IsOptional() @trim() @IsString() @MaxLength(100) q?: string;

  @IsOptional()
  @IsIn(INSTRUCTOR_STATUS_LABELS, { message: "status must be Active or Inactive" })
  status?: InstructorStatusLabel;

  @IsOptional() @IsIn(["joinDate", "name"]) sortBy: "joinDate" | "name" = "joinDate";
  @IsOptional() @IsIn(["asc", "desc"]) sortOrder: "asc" | "desc" = "desc";
}

/** Students tab: search + pagination. */
export class InstructorStudentsQueryDto extends PaginationQueryDto {
  @IsOptional() @trim() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsUUID("all", { message: "courseId must be a valid id" }) courseId?: string;
}

/** Schedule tab: ISO date range (defaults to the current month ± 1). */
export class ScheduleQueryDto {
  @IsOptional() @IsDateString({}, { message: "from must be an ISO date" }) from?: string;
  @IsOptional() @IsDateString({}, { message: "to must be an ISO date" }) to?: string;
}

// ---------------------------------------------------------------- create / update

const NAME = () => (target: object, key: string) => {
  trim()(target, key);
  IsString()(target, key);
  MinLength(2, { message: "Full name must be at least 2 characters" })(target, key);
  MaxLength(60, { message: "Name cannot exceed 60 characters" })(target, key);
};

const ASSIGN_COURSES = () => (target: object, key: string) => {
  IsArray()(target, key);
  ArrayMaxSize(100, { message: "Assign at most 100 courses at once" })(target, key);
  ArrayUnique({ message: "Duplicate course" })(target, key);
  IsUUID("all", { each: true, message: "Each course id must be valid" })(target, key);
};

export class CreateInstructorDto {
  @NAME() name!: string;

  @trimLower()
  @IsEmail({}, { message: "Please provide a valid email address" })
  @MaxLength(254)
  email!: string;

  @IsOptional()
  @trim()
  @IsString()
  @Matches(PHONE_RE, { message: "Please provide a valid phone number" })
  phone?: string;

  @IsIn(INSTRUCTOR_STATUS_LABELS, { message: "Status must be Active or Inactive" })
  status: InstructorStatusLabel = "Active";

  /** Optional "Assign Courses" step — moves these courses to the new instructor. */
  @IsOptional() @ASSIGN_COURSES() courseIds: string[] = [];
}


export class UpdateInstructorDto {
  @IsOptional() @NAME() name?: string;

  @IsOptional()
  @trimLower()
  @IsEmail({}, { message: "Please provide a valid email address" })
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @trim()
  @IsString()
  @Matches(PHONE_RE, { message: "Please provide a valid phone number" })
  phone?: string;

  @IsOptional()
  @IsIn(INSTRUCTOR_STATUS_LABELS, { message: "Status must be Active or Inactive" })
  status?: InstructorStatusLabel;

  // profile (optional — shown on the details page)
  @IsOptional() @trim() @IsString() @MaxLength(80, { message: "Title cannot exceed 80 characters" }) title?: string;
  @IsOptional() @trim() @IsString() @MaxLength(80, { message: "Expertise cannot exceed 80 characters" }) expertise?: string;
  @IsOptional() @trim() @IsString() @MaxLength(2000, { message: "Bio cannot exceed 2000 characters" }) bio?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20, { message: "Add up to 20 skills" })
  @IsString({ each: true })
  @MaxLength(40, { each: true, message: "Each skill must be 40 characters or less" })
  skills?: string[];

  /** { linkedin?, twitter?, website? } — each "" (clear) or a full http(s) URL. */
  @IsOptional() @IsSocialLinks() socials?: SocialLinks;
}

export class UpdateInstructorStatusDto {
  @IsIn(INSTRUCTOR_STATUS_LABELS, { message: "Status must be Active or Inactive" })
  status!: InstructorStatusLabel;
}

export class AssignCoursesDto {
  @ArrayMinSize(1, { message: "Select at least one course" })
  @ASSIGN_COURSES()
  courseIds!: string[];
}

// ---------------------------------------------------------------- message

export class InstructorMessageDto {
  @trim()
  @IsString()
  @MinLength(3, { message: "Subject must be at least 3 characters" })
  @MaxLength(120, { message: "Subject cannot exceed 120 characters" })
  subject!: string;

  @trim()
  @IsString()
  @MinLength(10, { message: "Message must be at least 10 characters" })
  @MaxLength(2000, { message: "Message cannot exceed 2000 characters" })
  body!: string;
}

// ---------------------------------------------------------------- notes

export class InstructorNoteDto {
  @trim()
  @IsString()
  @MinLength(3, { message: "Title must be at least 3 characters" })
  @MaxLength(100, { message: "Title cannot exceed 100 characters" })
  title!: string;

  /** Rich-text HTML; sanitized server-side, min 10 visible characters (checked in the service). */
  @IsString()
  @MaxLength(20_000, { message: "Note is too long" })
  content!: string;

  @IsIn(NOTE_TYPES, { message: "Please select a note type" })
  type!: InstructorNoteType;

  @IsIn(NOTE_PRIORITIES, { message: "Please select a priority" })
  priority!: NotePriority;

  @IsBoolean()
  hasReminder!: boolean;

  @ValidateIf((o: InstructorNoteDto) => o.hasReminder)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "Please pick a reminder date" })
  reminderDate?: string;

  @IsArray()
  @ArrayMaxSize(10, { message: "You can add up to 10 tags" })
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(30, { each: true, message: "Each tag must be 30 characters or less" })
  tags: string[] = [];
}
