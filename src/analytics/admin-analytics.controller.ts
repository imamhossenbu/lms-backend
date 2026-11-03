import { Controller, Get, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser, RequireRoles, ValidateDto, type AuthUser } from "../common/auth-user";
import { RequirePermission } from "../team/permissions.guard";
import { AnalyticsRangeDto, CoursesReportQueryDto, RevenueReportQueryDto, StudentsReportQueryDto } from "./dto/analytics-query.dto";
import { AnalyticsReportsService } from "./services/analytics-reports.service";

/**
 * Admin panel › Dashboard home and Analytics reports (one endpoint per tab). Every endpoint takes the shared
 * reporting period `?from=YYYY-MM-DD&to=YYYY-MM-DD` (workspace-local, inclusive; none = All time).
 * Revenue / Students / Courses / Engagement also need the plan's "Advanced analytics" feature (403 PLAN_FEATURE_REQUIRED).
 */
@ApiTags("Admin · Analytics")
@Controller("admin/analytics")
@RequireRoles("ADMIN")
@ValidateDto()
export class AdminAnalyticsController {
  constructor(private readonly reports: AnalyticsReportsService) {}

  @Get("dashboard")
  @RequirePermission("dashboard", "view")
  @ApiOperation({ summary: "Dashboard home: KPI cards, revenue & student growth, enrollments by course, completion, recent orders / enrollments, top courses" })
  dashboard(@CurrentUser() user: AuthUser, @Query() q: AnalyticsRangeDto) {
    return this.reports.dashboard(user, q);
  }

  @Get("overview")
  @RequirePermission("analytics", "view")
  @ApiOperation({ summary: "Analytics › Overview: 8 KPIs, revenue + enrollments trend, highlights" })
  overview(@CurrentUser() user: AuthUser, @Query() q: AnalyticsRangeDto) {
    return this.reports.overview(user, q);
  }

  @Get("revenue")
  @RequirePermission("analytics", "view")
  @ApiOperation({ summary: "Analytics › Revenue: summary, trend (granularity), by method / category / course, order funnel" })
  revenue(@CurrentUser() user: AuthUser, @Query() q: RevenueReportQueryDto) {
    return this.reports.revenue(user, q);
  }

  @Get("students")
  @RequirePermission("analytics", "view")
  @ApiOperation({ summary: "Analytics › Students: summary, growth, retention, completion, enrollments by category, top students" })
  students(@CurrentUser() user: AuthUser, @Query() q: StudentsReportQueryDto) {
    return this.reports.students(user, q);
  }

  @Get("courses")
  @RequirePermission("analytics", "view")
  @ApiOperation({ summary: "Analytics › Courses: published courses, enrollments, revenue, instructors, course table, instructor leaderboard" })
  courses(@CurrentUser() user: AuthUser, @Query() q: CoursesReportQueryDto) {
    return this.reports.courses(user, q);
  }

  @Get("engagement")
  @RequirePermission("analytics", "view")
  @ApiOperation({ summary: "Analytics › Engagement: quizzes, assignments, live attendance, certificates, community" })
  engagement(@CurrentUser() user: AuthUser, @Query() q: AnalyticsRangeDto) {
    return this.reports.engagement(user, q);
  }
}
