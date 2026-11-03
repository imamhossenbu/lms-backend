import { Body, Controller, Get, HttpCode, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser, RequireRoles, SaasValidation, type AuthUser } from "../controllers/saas-controller.utils";
import { PLATFORM_OWNER_ROLE } from "../saas.constants";
import { AlertsService } from "./alerts.service";
import { AlertIdsDto, ListAlertsQueryDto } from "./dto/alerts.dto";

/** Owner Console › navbar bell + /alerts: live "needs attention" items with the caller's read-state. */
@ApiTags("SaaS · Owner")
@Controller("saas/owner/alerts")
@RequireRoles(PLATFORM_OWNER_ROLE)
@SaasValidation()
export class OwnerAlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @Get()
  @ApiOperation({ summary: "Alerts with read flags — { data, meta, summary: { total, unread, searched, byKind } }" })
  list(@CurrentUser() user: AuthUser, @Query() q: ListAlertsQueryDto) {
    return this.alerts.list(user.userId, q);
  }

  @Post("read")
  @HttpCode(200)
  markRead(@CurrentUser() user: AuthUser, @Body() dto: AlertIdsDto) {
    return this.alerts.markRead(user.userId, dto.ids);
  }

  @Post("unread")
  @HttpCode(200)
  markUnread(@CurrentUser() user: AuthUser, @Body() dto: AlertIdsDto) {
    return this.alerts.markUnread(user.userId, dto.ids);
  }

  @Post("read-all")
  @HttpCode(200)
  markAllRead(@CurrentUser() user: AuthUser) {
    return this.alerts.markAllRead(user.userId);
  }
}
