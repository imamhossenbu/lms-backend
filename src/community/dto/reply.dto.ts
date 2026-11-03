import { IsBoolean, IsOptional, IsUUID, ValidateIf } from "class-validator";
import { PlainTextLength } from "../../common/validators";
import { COMMUNITY_LIMITS as L } from "../community.constants";

/** Reply composer (= panel replyFormSchema). */
export class ReplyBodyDto {
  @PlainTextLength(L.replyMin, L.replyMax, "Write a reply", `Keep it under ${L.replyMax} characters`) bodyHtml!: string;
}

export class CreateReplyDto extends ReplyBodyDto {
  /** Reply being answered; null / omitted = top-level. */
  @IsOptional() @IsUUID("all", { message: "parentId must be a valid id" }) parentId?: string | null;
}

/** Accept (or clear with null) the answer of a QUESTION thread. */
export class AcceptReplyDto {
  @ValidateIf((o) => o.replyId !== null)
  @IsUUID("all", { message: "replyId must be a valid id or null" })
  replyId!: string | null;
}

export class SetReplyRemovedDto {
  @IsBoolean() removed!: boolean;
}
