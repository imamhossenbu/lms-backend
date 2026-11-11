import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsEmail, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";

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
