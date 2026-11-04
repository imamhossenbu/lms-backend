import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";
import { PaginationQueryDto } from "../../common/pagination";
import { NOTE_CATEGORY_VALUES, STUDENT_STATUS_LABELS } from "../students.constants";
import type { StudentNoteCategoryValue, StudentStatusLabel } from "../students.types";

const trim = () => Transform(({ value }) => (typeof value === "string" ? value.trim() : value));
const trimLower = () => Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value));
const PHONE_RE = /^$|^\+?[0-9 ()-]{7,20}$/;
const JOINED_WITHIN_DAYS = [7, 30, 90] as const;

// ---------------------------------------------------------------- list

export class StudentQueryDto extends PaginationQueryDto {
  /** Searches name, email and phone. */
  @IsOptional() @trim() @IsString() @MaxLength(100) q?: string;

  @IsOptional()
  @IsIn(STUDENT_STATUS_LABELS, { message: "status must be Active, Inactive or Suspended" })
  status?: StudentStatusLabel;

  /** Only students enrolled in this course. */
  @IsOptional() @IsUUID("all", { message: "courseId must be a valid id" }) courseId?: string;

  /** Only students who joined in the last 7, 30 or 90 days. */
  @IsOptional()
  @Type(() => Number)
  @IsIn(JOINED_WITHIN_DAYS, { message: "joinedWithinDays must be 7, 30 or 90" })
  joinedWithinDays?: (typeof JOINED_WITHIN_DAYS)[number];

  @IsOptional() @IsIn(["joinDate", "name"]) sortBy: "joinDate" | "name" = "joinDate";
  @IsOptional() @IsIn(["asc", "desc"]) sortOrder: "asc" | "desc" = "desc";
}

// ---------------------------------------------------------------- create / update

export class CreateStudentDto {
  @trim()
  @IsString()
  @MinLength(2, { message: "Full name must be at least 2 characters" })
  @MaxLength(60, { message: "Name cannot exceed 60 characters" })
  name!: string;

  @trimLower()
  @IsEmail({}, { message: "Please provide a valid email address" })
  @MaxLength(254)
  email!: string;

  @IsOptional()
  @trim()
  @IsString()
  @Matches(PHONE_RE, { message: "Enter a valid phone number" })
  phone?: string;

  @IsIn(STUDENT_STATUS_LABELS, { message: "Status must be Active, Inactive or Suspended" })
  status: StudentStatusLabel = "Active";

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50, { message: "Enroll in at most 50 courses at once" })
  @ArrayUnique({ message: "Duplicate course" })
  @IsUUID("all", { each: true, message: "Each course id must be valid" })
  enrolledCourseIds: string[] = [];
}

export class UpdateStudentDto {
  @IsOptional()
  @trim()
  @IsString()
  @MinLength(2, { message: "Full name must be at least 2 characters" })
  @MaxLength(60, { message: "Name cannot exceed 60 characters" })
  name?: string;

  @IsOptional()
  @trimLower()
  @IsEmail({}, { message: "Please provide a valid email address" })
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @trim()
  @IsString()
  @Matches(PHONE_RE, { message: "Enter a valid phone number" })
  phone?: string;

  @IsOptional()
  @IsIn(STUDENT_STATUS_LABELS, { message: "Status must be Active, Inactive or Suspended" })
  status?: StudentStatusLabel;
}

export class UpdateStudentStatusDto {
  @IsIn(STUDENT_STATUS_LABELS, { message: "Status must be Active, Inactive or Suspended" })
  status!: StudentStatusLabel;
}

// ---------------------------------------------------------------- enrollments

export class EnrollCoursesDto {
  @IsArray()
  @ArrayMinSize(1, { message: "Select at least one course" })
  @ArrayMaxSize(50, { message: "Enroll in at most 50 courses at once" })
  @ArrayUnique({ message: "Duplicate course" })
  @IsUUID("all", { each: true, message: "Each course id must be valid" })
  courseIds!: string[];
}

// ---------------------------------------------------------------- notes

export class StudentNoteDto {
  @IsIn(NOTE_CATEGORY_VALUES, { message: "Choose a note category" })
  category!: StudentNoteCategoryValue;

  @trim()
  @IsString()
  @MinLength(2, { message: "Write a note first" })
  @MaxLength(2000, { message: "Notes are limited to 2,000 characters" })
  content!: string;
}
