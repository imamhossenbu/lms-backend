import { Transform } from "class-transformer";
import { ArrayMinSize, IsArray, IsBoolean, IsIn, IsString, MaxLength, MinLength } from "class-validator";
import { LIMITS, NOTIFICATION_CHANNELS } from "../notifications.constants";
import type { NotificationChannel } from "../notifications.types";

const trim = () => Transform(({ value }) => (typeof value === "string" ? value.trim() : value));

/** Automated template editor — panel templateEditorSchema (placeholder check in notification-rules.ts). */
export class UpdateTemplateDto {
  @trim()
  @IsString()
  @MinLength(LIMITS.templateNameMin, { message: "Name is required" })
  @MaxLength(LIMITS.templateNameMax, { message: `${LIMITS.templateNameMax} characters or less` })
  name!: string;

  @trim()
  @IsString()
  @MinLength(LIMITS.templateSubjectMin, { message: "Subject is required" })
  @MaxLength(LIMITS.templateSubjectMax, { message: `${LIMITS.templateSubjectMax} characters or less` })
  subject!: string;

  @trim()
  @IsString()
  @MinLength(LIMITS.templateBodyMin, { message: `Write at least ${LIMITS.templateBodyMin} characters` })
  @MaxLength(LIMITS.templateBodyMax, { message: `${LIMITS.templateBodyMax} characters or less` })
  body!: string;

  @IsArray()
  @ArrayMinSize(1, { message: "Choose at least one channel" })
  @IsIn(NOTIFICATION_CHANNELS, { each: true, message: "Choose a valid channel" })
  channels!: NotificationChannel[];

  @IsBoolean() enabled!: boolean;
}

export class SetTemplateEnabledDto {
  @IsBoolean() enabled!: boolean;
}
