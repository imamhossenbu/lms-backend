import { Transform } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  registerDecorator,
  type ValidationArguments,
} from "class-validator";
import { permissionsError, type RolePermissions } from "../team-permissions";

export const ROLE_NAME_MAX = 40;
export const ROLE_DESCRIPTION_MAX = 160;
export const INVITE_MESSAGE_MAX = 300;
export const INVITE_MAX_EMAILS = 10;
export const ROLE_TONES = ["orange", "blue", "green", "purple", "yellow", "red", "gray"] as const;

const trim = () => Transform(({ value }) => (typeof value === "string" ? value.trim() : value));
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Validates a `{ module: action[] }` map (every module present, applicable actions only, no duplicates).
 * `requireView`: roles need View whenever another action is on; member extras don't.
 */
function IsPermissionMap(requireView: boolean): PropertyDecorator {
  return (target: object, propertyName: string | symbol) =>
    registerDecorator({
      name: "isPermissionMap",
      target: target.constructor,
      propertyName: String(propertyName),
      validator: {
        validate: (value: unknown) => permissionsError(value, requireView) === null,
        defaultMessage: (args?: ValidationArguments) => permissionsError(args?.value, requireView) ?? "Invalid permissions",
      },
    });
}

// ---------------------------------------------------------------- roles

export class RoleDto {
  @trim()
  @IsString()
  @MinLength(2, { message: "Role name must be at least 2 characters" })
  @MaxLength(ROLE_NAME_MAX, { message: `Role name must be ${ROLE_NAME_MAX} characters or less` })
  @Matches(/^[\p{L}\p{N} &'()\-/.]+$/u, { message: "Use letters, numbers, spaces and & ' ( ) - / . only" })
  name!: string;

  @trim()
  @IsString()
  @MaxLength(ROLE_DESCRIPTION_MAX, { message: `Description must be ${ROLE_DESCRIPTION_MAX} characters or less` })
  description: string = "";

  @IsIn(ROLE_TONES, { message: "Choose a colour" })
  tone!: (typeof ROLE_TONES)[number];

  @IsPermissionMap(true)
  permissions!: RolePermissions;
}

// ---------------------------------------------------------------- invitations

export class InviteMembersDto {
  @IsArray()
  @ArrayMinSize(1, { message: "Add at least one email address" })
  @ArrayMaxSize(INVITE_MAX_EMAILS, { message: `Invite up to ${INVITE_MAX_EMAILS} people at a time` })
  @Transform(({ value }) => (Array.isArray(value) ? value.map((e) => (typeof e === "string" ? e.trim().toLowerCase() : e)) : value))
  @Matches(EMAIL_RE, { each: true, message: "Each entry must be a valid email address" })
  @MaxLength(254, { each: true })
  emails!: string[];

  @IsUUID("all", { message: "Choose a role" })
  roleId!: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(INVITE_MESSAGE_MAX, { message: `Message must be ${INVITE_MESSAGE_MAX} characters or less` })
  message: string = "";

  /** Only sent when "Give extra permissions" is on. */
  @IsOptional()
  @IsPermissionMap(false)
  extraPermissions?: RolePermissions;
}

/** Public: open an invitation link. */
export class InviteTokenQueryDto {
  @IsString()
  @MinLength(20, { message: "This invitation link is incomplete" })
  @MaxLength(200)
  token!: string;
}

/** Public: accept an invitation by creating the account. */
export class AcceptInviteDto extends InviteTokenQueryDto {
  @trim()
  @IsString()
  @MinLength(2, { message: "Full name must be at least 2 characters" })
  @MaxLength(80, { message: "Name must be 80 characters or less" })
  name!: string;

  @IsString()
  @MinLength(8, { message: "Password must be at least 8 characters" })
  @MaxLength(128, { message: "Password is too long" })
  @Matches(/[A-Za-z]/, { message: "Include at least one letter" })
  @Matches(/[0-9]/, { message: "Include at least one number" })
  password!: string;
}

// ---------------------------------------------------------------- members

export class UpdateMemberDto {
  @IsOptional()
  @IsUUID("all", { message: "Choose a role" })
  roleId?: string;

  @IsOptional()
  @IsIn(["ACTIVE", "SUSPENDED"], { message: "Status must be ACTIVE or SUSPENDED" })
  status?: "ACTIVE" | "SUSPENDED";

  /** Shown in the activity log for suspensions / reactivations. */
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(200, { message: "Reason must be 200 characters or less" })
  reason?: string;
}

export class ExtraPermissionsDto {
  @IsPermissionMap(false)
  extraPermissions!: RolePermissions;
}

export class RemindTwoFactorDto {
  @IsArray()
  @ArrayMinSize(1, { message: "Select at least one member" })
  @ArrayMaxSize(100)
  @IsUUID("all", { each: true, message: "Each member id must be valid" })
  memberIds!: string[];
}
