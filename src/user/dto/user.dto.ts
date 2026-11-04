import { Transform } from "class-transformer";
import { IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from "class-validator";

const trim = () => Transform(({ value }) => (typeof value === "string" ? value.trim() : value));
const text = (max: number) => (target: object, key: string) => {
  IsOptional()(target, key);
  trim()(target, key);
  IsString()(target, key);
  MaxLength(max, { message: `${key} must be ${max} characters or less` })(target, key);
};

/**
 * Self-service profile edit. ONLY these fields can change here — role, status, email, institution,
 * password and verification flags are never writable through this endpoint (mass-assignment guard).
 */
export class UpdateProfileDto {
  @IsOptional()
  @trim()
  @IsString()
  @MinLength(2, { message: "Name must be at least 2 characters" })
  @MaxLength(80, { message: "Name must be 80 characters or less" })
  name?: string;

  @IsOptional()
  @trim()
  @IsString()
  @Matches(/^$|^\+?[0-9 ()-]{7,20}$/, { message: "Enter a valid phone number" })
  phone?: string;

  @text(2000) bio?: string;
  @text(500) education?: string;
  @text(500) skills?: string;
  @text(500) interests?: string;
  @text(80) country?: string;
  @text(40) language?: string;
  @text(2000) socialLinks?: string;
  @text(300) address?: string;
}

export class ChangeOwnPasswordDto {
  @IsString()
  @MinLength(1, { message: "Current password is required" })
  currentPassword!: string;

  @IsString()
  @MinLength(8, { message: "New password must be at least 8 characters" })
  @MaxLength(128, { message: "Password is too long" })
  @Matches(/[A-Za-z]/, { message: "Include at least one letter" })
  @Matches(/[0-9]/, { message: "Include at least one number" })
  newPassword!: string;
}

/** Admin: switch a learner / instructor role. Staff (ADMIN) and the platform owner are managed elsewhere. */
export class ChangeRoleDto {
  @IsUUID("all", { message: "userId must be a valid id" })
  userId!: string;

  @IsIn(["STUDENT", "TEACHER"], { message: "role must be STUDENT or TEACHER (manage admins from Team)" })
  role!: "STUDENT" | "TEACHER";
}

export class ChangeStatusDto {
  @IsUUID("all", { message: "userId must be a valid id" })
  userId!: string;

  @IsIn(["ACTIVE", "INACTIVE", "BLOCKED"], { message: "status must be ACTIVE, INACTIVE or BLOCKED" })
  status!: "ACTIVE" | "INACTIVE" | "BLOCKED";
}
