import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import { IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from "class-validator";

const trim = ({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value);

export class TeacherPageQueryDto {
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(100) q?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) courseId?: string;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @ApiPropertyOptional({ default: 10 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}

export class SubmissionQueryDto extends TeacherPageQueryDto {
  @ApiPropertyOptional({ enum: ["PENDING", "GRADED"] }) @IsOptional() @IsIn(["PENDING", "GRADED"]) status?: "PENDING" | "GRADED";
}

export class AttemptQueryDto extends TeacherPageQueryDto {
  @ApiPropertyOptional({ enum: ["passed", "failed"] }) @IsOptional() @IsIn(["passed", "failed"]) result?: "passed" | "failed";
}

export class QuestionQueryDto extends TeacherPageQueryDto {
  @ApiPropertyOptional({ enum: ["open", "answered"] }) @IsOptional() @IsIn(["open", "answered"]) status?: "open" | "answered";
}

export class LiveQueryDto {
  @ApiPropertyOptional({ enum: ["upcoming", "past"] }) @IsOptional() @IsIn(["upcoming", "past"]) when?: "upcoming" | "past";
}

export class GradeSubmissionDto {
  @ApiProperty() @Type(() => Number) @IsNumber({}, { message: "Enter the marks" }) @Min(0, { message: "Marks can't be negative" }) marks!: number;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(5000, { message: "Feedback can be at most 5,000 characters" }) feedback?: string;
}

export class ReplyDto {
  @ApiProperty() @Transform(trim) @IsString() @MinLength(2, { message: "Write your answer" }) @MaxLength(10000, { message: "Your answer is too long" }) body!: string;
}

export class TeacherProfileDto {
  @ApiProperty() @Transform(trim) @IsString() @MinLength(2, { message: "Enter your full name" }) @MaxLength(80) name!: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @Matches(/^$|^\+?[0-9 ()-]{7,20}$/, { message: "Enter a valid phone number" }) phone?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(100) headline?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(2000) bio?: string;
  @ApiPropertyOptional({ description: "Comma-separated" }) @IsOptional() @Transform(trim) @IsString() @MaxLength(300) expertise?: string;
}

export class TeacherPasswordDto {
  @ApiProperty() @IsString() @IsNotEmpty({ message: "Enter your current password" }) @MaxLength(100) currentPassword!: string;
  @ApiProperty() @IsString() @MinLength(8, { message: "Use at least 8 characters" }) @MaxLength(100) newPassword!: string;
}
