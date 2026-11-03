import { ApiPropertyOptional, PickType } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";
import { PaginationQueryDto } from "../../common/pagination";
import { PlainTextLength } from "../../common/validators";
import { BROADCAST_AUDIENCES, BROADCAST_STATUSES, BROADCAST_TIMINGS, DELIVERY_STATUSES, LIMITS, NOTIFICATION_CHANNELS, NOTIFICATION_PRIORITIES } from "../notifications.constants";
import type { BroadcastAudience, BroadcastStatus, BroadcastTiming, DeliveryStatus, NotificationChannel, NotificationPriority } from "../notifications.types";

const trim = () => Transform(({ value }) => (typeof value === "string" ? value.trim() : value));
/** `?courseIds=a,b` or repeated `?courseIds=a&courseIds=b`. */
const csv = () => Transform(({ value }) => (Array.isArray(value) ? value : typeof value === "string" && value ? value.split(",").map((v) => v.trim()).filter(Boolean) : []));

/** Compose / edit broadcast — panel broadcastFormSchema (cross-field rules in notification-rules.ts). */
export class BroadcastFormDto {
  @trim()
  @IsString()
  @MinLength(LIMITS.titleMin, { message: `Title must be at least ${LIMITS.titleMin} characters` })
  @MaxLength(LIMITS.titleMax, { message: `${LIMITS.titleMax} characters or less` })
  title!: string;

  @IsString()
  @MaxLength(LIMITS.messageMax * 10, { message: `Keep it under ${LIMITS.messageMax} characters` })
  @PlainTextLength(LIMITS.messageMin, LIMITS.messageMax, `Write at least ${LIMITS.messageMin} characters`, `Keep it under ${LIMITS.messageMax} characters`)
  messageHtml!: string;

  @IsIn(BROADCAST_AUDIENCES, { message: "Choose who should receive this" })
  audience!: BroadcastAudience;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(LIMITS.maxCourses, { message: `Up to ${LIMITS.maxCourses} courses` })
  @IsUUID("all", { each: true, message: "Select a valid course" })
  courseIds: string[] = [];

  @IsArray()
  @ArrayMinSize(1, { message: "Choose at least one channel" })
  @IsIn(NOTIFICATION_CHANNELS, { each: true, message: "Choose a valid channel" })
  channels!: NotificationChannel[];

  @IsOptional()
  @IsIn(NOTIFICATION_PRIORITIES, { message: "Choose a valid priority" })
  priority: NotificationPriority = "NORMAL";

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(LIMITS.ctaLabelMax, { message: `${LIMITS.ctaLabelMax} characters or less` })
  ctaLabel: string = "";

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(LIMITS.ctaUrlMax, { message: "This link is too long" })
  ctaUrl: string = "";

  @IsOptional()
  @IsIn(BROADCAST_TIMINGS, { message: "Choose send now or schedule" })
  timing: BroadcastTiming = "NOW";

  /** "YYYY-MM-DDTHH:mm" (datetime-local, workspace time) or ISO when timing = SCHEDULE. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  scheduledAt: string = "";
}

export class SaveBroadcastDto extends BroadcastFormDto {
  @ApiPropertyOptional({ description: "Save as DRAFT instead of sending / scheduling" })
  @IsOptional()
  @IsBoolean()
  asDraft?: boolean;
}

/** "Send test" from the compose page — emailed to the signed-in admin. */
export class TestBroadcastDto extends PickType(BroadcastFormDto, ["title", "messageHtml", "ctaLabel", "ctaUrl"] as const) {}

export class BroadcastQueryDto extends PaginationQueryDto {
  @IsOptional() @trim() @IsString() @MaxLength(200) q?: string;
  @IsOptional() @IsIn(BROADCAST_STATUSES) status?: BroadcastStatus;
  @IsOptional() @IsIn(BROADCAST_AUDIENCES) audience?: BroadcastAudience;
  @IsOptional() @IsIn(NOTIFICATION_CHANNELS) channel?: NotificationChannel;
}

export class DeliveryQueryDto extends PaginationQueryDto {
  @IsOptional() @trim() @IsString() @MaxLength(200) q?: string;
  @IsOptional() @IsIn(NOTIFICATION_CHANNELS) channel?: NotificationChannel;
  @IsOptional() @IsIn(DELIVERY_STATUSES) status?: DeliveryStatus;
}

/** Live recipient estimate for the compose page. */
export class EstimateQueryDto {
  @IsIn(BROADCAST_AUDIENCES) audience!: BroadcastAudience;

  @IsOptional()
  @csv()
  @IsArray()
  @ArrayMaxSize(LIMITS.maxCourses)
  @IsUUID("all", { each: true, message: "Select a valid course" })
  courseIds: string[] = [];
}
