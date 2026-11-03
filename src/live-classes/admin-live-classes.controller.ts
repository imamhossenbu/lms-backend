import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser, RequireRoles, ValidateDto, type AuthUser } from "../common/auth-user";
import { PaginationQueryDto } from "../common/pagination";
import { RequirePermission } from "../team/permissions.guard";
import {
  AnswerQuestionDto,
  AttendanceQueryDto,
  CreateLiveClassDto,
  LiveClassQueryDto,
  LiveResourceDto,
  LiveStatsQueryDto,
  QuestionQueryDto,
  RemindDto,
  SetAttendanceDto,
  UpdateLiveClassDto,
  UpdateLiveResourceDto,
} from "./dto/live-class.dto";
import { LiveClassAdminService } from "./services/live-class-admin.service";
import { LiveClassesQueryService } from "./services/live-classes-query.service";

const Uuid = (name: string) => Param(name, new ParseUUIDPipe({ errorHttpStatusCode: 404 }));

/** Admin panel › Live Classes. */
@ApiTags("Admin · Live Classes")
@Controller("admin/live-classes")
@RequireRoles("ADMIN")
@ValidateDto()
export class AdminLiveClassesController {
  constructor(
    private readonly query: LiveClassesQueryService,
    private readonly admin: LiveClassAdminService,
  ) {}

  @Get()
  @RequirePermission("liveClasses", "view")
  @ApiOperation({ summary: "Paginated classes with display status (LIVE/UPCOMING/…), course, instructor, invited and attendee counts" })
  list(@CurrentUser() user: AuthUser, @Query() q: LiveClassQueryDto) {
    return this.query.list(user, q);
  }

  @Get("stats")
  @RequirePermission("liveClasses", "view")
  @ApiOperation({ summary: "List cards: totals + 30-day change" })
  stats(@CurrentUser() user: AuthUser, @Query() q: LiveStatsQueryDto) {
    return this.query.stats(user, q);
  }

  @Get(":id")
  @RequirePermission("liveClasses", "view")
  detail(@CurrentUser() user: AuthUser, @Uuid("id") id: string) {
    return this.query.detail(user, id);
  }

  @Get(":id/insights")
  @RequirePermission("liveClasses", "view")
  @ApiOperation({ summary: "Attendance stats, presence timeline, most engaged students, Q&A counts" })
  insights(@CurrentUser() user: AuthUser, @Uuid("id") id: string) {
    return this.query.insights(user, id);
  }

  @Get(":id/attendance")
  @RequirePermission("liveClasses", "view")
  @ApiOperation({ summary: "Roster: one row per invited student with attendance" })
  attendance(@CurrentUser() user: AuthUser, @Uuid("id") id: string, @Query() q: AttendanceQueryDto) {
    return this.query.attendance(user, id, q);
  }

  @Get(":id/questions")
  @RequirePermission("liveClasses", "view")
  questions(@CurrentUser() user: AuthUser, @Uuid("id") id: string, @Query() q: QuestionQueryDto) {
    return this.query.questions(user, id, q);
  }

  @Get(":id/resources")
  @RequirePermission("liveClasses", "view")
  resources(@CurrentUser() user: AuthUser, @Uuid("id") id: string) {
    return this.query.resources(user, id);
  }

  @Get(":id/activity")
  @RequirePermission("liveClasses", "view")
  activity(@CurrentUser() user: AuthUser, @Uuid("id") id: string, @Query() q: PaginationQueryDto) {
    return this.query.activity(user, id, q);
  }

  @Post()
  @RequirePermission("liveClasses", "manage")
  @ApiOperation({ summary: "Schedule a class (must start in the future)" })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateLiveClassDto) {
    return this.admin.create(user, dto);
  }

  @Patch(":id")
  @RequirePermission("liveClasses", "manage")
  @ApiOperation({ summary: "Edit any subset of fields (re-scheduling must land in the future)" })
  update(@CurrentUser() user: AuthUser, @Uuid("id") id: string, @Body() dto: UpdateLiveClassDto) {
    return this.admin.update(user, id, dto);
  }

  @Post(":id/cancel")
  @HttpCode(200)
  @RequirePermission("liveClasses", "manage")
  @ApiOperation({ summary: "Cancel and email the invited students" })
  cancel(@CurrentUser() user: AuthUser, @Uuid("id") id: string) {
    return this.admin.cancel(user, id);
  }

  @Post(":id/restore")
  @HttpCode(200)
  @RequirePermission("liveClasses", "manage")
  restore(@CurrentUser() user: AuthUser, @Uuid("id") id: string) {
    return this.admin.restore(user, id);
  }

  @Post(":id/duplicate")
  @RequirePermission("liveClasses", "manage")
  duplicate(@CurrentUser() user: AuthUser, @Uuid("id") id: string) {
    return this.admin.duplicate(user, id);
  }

  @Post(":id/reminders")
  @HttpCode(200)
  @RequirePermission("liveClasses", "manage")
  @ApiOperation({ summary: "Email invited students (optionally only those who haven't joined)" })
  remind(@CurrentUser() user: AuthUser, @Uuid("id") id: string, @Body() dto: RemindDto) {
    return this.admin.sendReminders(user, id, dto.onlyNotJoined);
  }

  @Delete(":id")
  @RequirePermission("liveClasses", "delete")
  remove(@CurrentUser() user: AuthUser, @Uuid("id") id: string) {
    return this.admin.remove(user, id);
  }

  @Patch(":id/attendance/:studentId")
  @RequirePermission("liveClasses", "manage")
  @ApiOperation({ summary: "Manual attendance override" })
  setAttendance(@CurrentUser() user: AuthUser, @Uuid("id") id: string, @Uuid("studentId") studentId: string, @Body() dto: SetAttendanceDto) {
    return this.admin.setAttendance(user, id, studentId, dto);
  }

  @Patch(":id/questions/:questionId")
  @RequirePermission("liveClasses", "manage")
  answer(@CurrentUser() user: AuthUser, @Uuid("id") id: string, @Uuid("questionId") questionId: string, @Body() dto: AnswerQuestionDto) {
    return this.admin.answer(user, id, questionId, dto);
  }

  @Post(":id/resources")
  @RequirePermission("liveClasses", "manage")
  addResource(@CurrentUser() user: AuthUser, @Uuid("id") id: string, @Body() dto: LiveResourceDto) {
    return this.admin.addResource(user, id, dto);
  }

  @Patch(":id/resources/:resourceId")
  @RequirePermission("liveClasses", "manage")
  updateResource(@CurrentUser() user: AuthUser, @Uuid("id") id: string, @Uuid("resourceId") resourceId: string, @Body() dto: UpdateLiveResourceDto) {
    return this.admin.updateResource(user, id, resourceId, dto);
  }

  @Delete(":id/resources/:resourceId")
  @RequirePermission("liveClasses", "manage")
  removeResource(@CurrentUser() user: AuthUser, @Uuid("id") id: string, @Uuid("resourceId") resourceId: string) {
    return this.admin.removeResource(user, id, resourceId);
  }
}
