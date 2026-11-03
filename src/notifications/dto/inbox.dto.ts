import { Transform } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from "class-validator";
import { PaginationQueryDto } from "../../common/pagination";
import { INBOX_STATUSES, LIMITS, NOTIFICATION_CATEGORIES, NOTIFICATION_PRIORITIES } from "../notifications.constants";
import type { NotificationCategory, NotificationPriority } from "../notifications.types";

const trim = () => Transform(({ value }) => (typeof value === "string" ? value.trim() : value));

/** Inbox feed filters (admin inbox and the user-facing /notification list). */
export class InboxQueryDto extends PaginationQueryDto {
  @IsOptional() @trim() @IsString() @MaxLength(200) q?: string;
  @IsOptional() @IsIn(NOTIFICATION_CATEGORIES) category?: NotificationCategory;
  @IsOptional() @IsIn(INBOX_STATUSES) status: (typeof INBOX_STATUSES)[number] = "all";
  /** HIGH = "High priority only". */
  @IsOptional() @IsIn(NOTIFICATION_PRIORITIES) priority?: NotificationPriority;
}

/** `ids: [...]` or `ids: "all"`. */
export class InboxIdsDto {
  @ValidateIf((o) => o.ids !== "all")
  @IsArray({ message: 'Send notification ids or "all"' })
  @ArrayMinSize(1, { message: "Select at least one notification" })
  @ArrayMaxSize(LIMITS.maxBulkIds, { message: `Up to ${LIMITS.maxBulkIds} at a time` })
  @IsUUID("all", { each: true, message: "Invalid notification id" })
  ids!: string[] | "all";
}

export class MarkReadDto extends InboxIdsDto {
  @IsOptional() @IsBoolean() isRead: boolean = true;
}

export class ArchiveDto extends InboxIdsDto {
  @IsOptional() @IsBoolean() isArchived: boolean = true;
}

export class DeleteNotificationsDto {
  @IsArray()
  @ArrayMinSize(1, { message: "Select at least one notification" })
  @ArrayMaxSize(LIMITS.maxBulkIds, { message: `Up to ${LIMITS.maxBulkIds} at a time` })
  @IsUUID("all", { each: true, message: "Invalid notification id" })
  ids!: string[];
}
