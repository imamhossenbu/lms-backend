import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AdminAnalyticsController } from "./admin-analytics.controller";
import { AnalyticsController } from "./analytics.controller";
import { AnalyticsService } from "./analytics.service";
import { AnalyticsDataService } from "./services/analytics-data.service";
import { AnalyticsReportsService } from "./services/analytics-reports.service";

/**
 * Admin panel › Dashboard + Analytics (/admin/analytics/*). The legacy /analytics/instructor endpoint (TEACHER
 * self-view) stays until the instructor app gets its own module; the legacy /analytics/admin was replaced.
 */
@Module({
  imports: [PrismaModule],
  controllers: [AdminAnalyticsController, AnalyticsController],
  providers: [AnalyticsDataService, AnalyticsReportsService, AnalyticsService],
})
export class AnalyticsModule {}
