import { IsEmail, IsOptional, IsString, Matches, MinLength } from "class-validator";

export class RegisterDto {
  @IsEmail()
  email!: string;
  @IsString()
  name!: string;
  @MinLength(8)
  password!: string;
}

export class LoginDto {
  @IsEmail()
  email!: string;
  @IsString()
  password!: string;
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(6, { message: "Current password is required" })
  currentPassword!: string;

  @IsString()
  @MinLength(6, { message: "New password must be at least 6 characters" })
  newPassword!: string;
}

export class ResetPasswordDto {
  @IsString()
  token!: string;

  @IsString()
  @MinLength(6, { message: "New password must be at least 6 characters" })
  newPassword!: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}

export class ForgotPasswordDto {
  @IsEmail()
  email!: string;
}

export class VerifyEmailDto {
  @IsString()
  code!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  purpose?: string;
}

export class ResendVerificationDto {
  @IsEmail()
  email!: string;
}
// ---------------------------------------------------------------- two-factor

export class TwoFactorCodeDto {
  @IsString()
  @Matches(/^\d{6}$/, { message: "Enter the 6-digit code from your authenticator app" })
  code!: string;
}

export class TwoFactorLoginDto extends TwoFactorCodeDto {
  @IsString()
  @MinLength(10, { message: "Sign-in session is missing" })
  challengeToken!: string;
}
