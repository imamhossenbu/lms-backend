import { Controller, Get, UseGuards, Req } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { AnalyticsService } from "./analytics.service";

@Controller("analytics")
@UseGuards(AuthGuard("jwt"), RolesGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  /**
   * System-wide KPI metrics and revenue overview for Admins
   */
  @Get("admin")
  @Roles("ADMIN")
  async getAdminOverview() {
    return this.analyticsService.getAdminOverview();
  }

  /**
   * Instructor personal course performance and revenue metrics
   */
  @Get("instructor")
  @Roles("TEACHER", "ADMIN")
  async getInstructorOverview(@Req() req: any) {
    return this.analyticsService.getInstructorOverview(req.user.userId);
  }
}
