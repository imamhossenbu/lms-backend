import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsOptional, IsString, Matches, MaxLength } from "class-validator";
import { PaginationQueryDto } from "../../../common/pagination";
import { Trim } from "../../dto/common";
import { ALERT_ID_REGEX, ALERT_KINDS, MAX_ALERT_IDS } from "../alerts.constants";
import type { AlertKind } from "../alerts.types";

/** GET /saas/owner/alerts — `?kind` (tab), `?status`, `?q` + pagination (same filters as /alerts). */
export class ListAlertsQueryDto extends PaginationQueryDto {
  @IsOptional() @IsIn(ALERT_KINDS, { message: `kind must be one of ${ALERT_KINDS.join(", ")}` }) kind?: AlertKind;
  @IsOptional() @IsIn(["read", "unread"], { message: "status must be read or unread" }) status?: "read" | "unread";
  @IsOptional() @Trim() @IsString() @MaxLength(100) q?: string;
}

export class AlertIdsDto {
  @IsArray({ message: "ids must be a list of alert ids" })
  @ArrayMinSize(1, { message: "Choose at least one alert" })
  @ArrayMaxSize(MAX_ALERT_IDS, { message: `At most ${MAX_ALERT_IDS} alerts at a time` })
  @IsString({ each: true })
  @Matches(ALERT_ID_REGEX, { each: true, message: "Unknown alert id" })
  ids!: string[];
}
