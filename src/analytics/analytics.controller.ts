import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Roles } from "../auth/decorators/roles.decorator";
import { RolesGuard } from "../auth/guards/roles.guard";
import { AnalyticsService } from "./analytics.service";
import { StaffPermission } from "../team/permissions.guard";

/**
 * Legacy instructor self-view (TEACHER). The admin overview that lived here (/analytics/admin) is replaced by
 * /admin/analytics/* (AdminAnalyticsController).
 */
@Controller("analytics")
@UseGuards(AuthGuard("jwt"), RolesGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  /** Instructor's own course performance and revenue. */
  @StaffPermission("analytics", "view")
  @Get("instructor")
  @Roles("TEACHER", "ADMIN")
  async getInstructorOverview(@Req() req: any) {
    return this.analyticsService.getInstructorOverview(req.user.userId);
  }
}
