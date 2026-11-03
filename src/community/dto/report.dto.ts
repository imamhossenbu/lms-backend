import { Transform } from "class-transformer";
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import { COMMUNITY_LIMITS as L, REPORT_ACTIONS, REPORT_REASONS } from "../community.constants";
import type { ReportAction, ReportReason } from "../community.types";

const trim = () => Transform(({ value }) => (typeof value === "string" ? value.trim() : value));

/** Review Report modal (= panel reportResolutionSchema). */
export class ResolveReportDto {
  @IsIn(REPORT_ACTIONS, { message: "action must be DISMISS, REMOVE_CONTENT or HIDE_THREAD" }) action!: ReportAction;
  @IsOptional() @trim() @IsString() @MaxLength(L.resolutionNoteMax, { message: "300 characters or less" }) note: string = "";
}

/** Student "Report" on a thread (or one of its replies). */
export class CreateReportDto {
  @IsIn(REPORT_REASONS, { message: "Choose a reason" }) reason!: ReportReason;
  @IsOptional() @trim() @IsString() @MaxLength(L.reportNoteMax, { message: "300 characters or less" }) note: string = "";
  /** Report a reply of this thread instead of the thread itself. */
  @IsOptional() @IsUUID("all", { message: "replyId must be a valid id" }) replyId?: string;
}
