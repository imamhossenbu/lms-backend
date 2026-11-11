import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import { IsEmail, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from "class-validator";

const trim = ({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value);
const lower = ({ value }: { value: unknown }) => (typeof value === "string" ? value.trim().toLowerCase() : value);

export class LearnerRegisterDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: "Enter your full name" })
  @MaxLength(80)
  name!: string;

  @ApiProperty()
  @Transform(lower)
  @IsEmail({}, { message: "Enter a valid email address" })
  @MaxLength(120)
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(6, { message: "Password must be at least 6 characters" })
  @MaxLength(100)
  password!: string;
}

export class LearnerLoginDto {
  @ApiProperty()
  @Transform(lower)
  @IsEmail({}, { message: "Enter a valid email address" })
  email!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: "Enter your password" })
  @MaxLength(100)
  password!: string;
}

export class LearnerVerifyDto {
  @ApiProperty()
  @Transform(lower)
  @IsEmail({}, { message: "Enter a valid email address" })
  email!: string;

  @ApiProperty()
  @Transform(trim)
  @Matches(/^\d{6}$/, { message: "Enter the 6-digit code from your email" })
  code!: string;
}

export class LearnerEmailDto {
  @ApiProperty()
  @Transform(lower)
  @IsEmail({}, { message: "Enter a valid email address" })
  email!: string;
}

export class CheckoutQuoteQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toUpperCase() : value))
  @IsString()
  @MaxLength(40)
  coupon?: string;
}

export class StartCheckoutDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  courseSlug!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toUpperCase() : value))
  @IsString()
  @MaxLength(40)
  coupon?: string;
}

export class LearnerProfileDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: "Enter your full name" })
  @MaxLength(80)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @Matches(/^$|^\+?[0-9 ()-]{7,20}$/, { message: "Enter a valid phone number" })
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500, { message: "Keep your bio under 500 characters" })
  bio?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(60)
  country?: string;
}

export class LearnerPasswordDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: "Enter your current password" })
  @MaxLength(100)
  currentPassword!: string;

  @ApiProperty()
  @IsString()
  @MinLength(8, { message: "Use at least 8 characters" })
  @MaxLength(100)
  newPassword!: string;
}

export class LiveQueryDto {
  @ApiPropertyOptional({ enum: ["upcoming", "past"] })
  @IsOptional()
  @IsIn(["upcoming", "past"])
  when?: "upcoming" | "past";
}

export class LearnerResetDto {
  @ApiProperty()
  @Transform(lower)
  @IsEmail({}, { message: "Enter a valid email address" })
  email!: string;

  @ApiProperty()
  @Transform(trim)
  @Matches(/^\d{6}$/, { message: "Enter the 6-digit code from your email" })
  code!: string;

  @ApiProperty()
  @IsString()
  @MinLength(8, { message: "Use at least 8 characters" })
  @MaxLength(100)
  newPassword!: string;
}

export class VideoPositionDto {
  @ApiProperty() @Type(() => Number) @IsNumber() @Min(0) @Max(86_400) seconds!: number;
}

export class AskQuestionDto {
  @ApiProperty() @Transform(trim) @IsString() @MinLength(5, { message: "Give your question a short title" }) @MaxLength(150, { message: "Keep the title under 150 characters" }) title!: string;
  @ApiProperty() @Transform(trim) @IsString() @MinLength(10, { message: "Describe your question (at least 10 characters)" }) @MaxLength(5000, { message: "Your question is too long" }) body!: string;
}

export class ReplyQuestionDto {
  @ApiProperty() @Transform(trim) @IsString() @MinLength(2, { message: "Write your reply" }) @MaxLength(5000, { message: "Your reply is too long" }) body!: string;
}
