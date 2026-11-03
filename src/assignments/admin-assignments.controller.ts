import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser, RequireRoles, ValidateDto, type AuthUser } from "../common/auth-user";
import { RequirePermission } from "../team/permissions.guard";
import { AssignmentQueryDto, AssignmentStatsQueryDto, CreateAssignmentDto, UpdateAssignmentDto } from "./dto/assignment.dto";
import { GradeSubmissionDto, SubmissionQueryDto } from "./dto/submission.dto";
import { AssignmentAdminService } from "./services/assignment-admin.service";
import { AssignmentSubmissionsService } from "./services/assignment-submissions.service";
import { AssignmentsQueryService } from "./services/assignments-query.service";

const AssignmentId = () => Param("id", new ParseUUIDPipe({ errorHttpStatusCode: 404 }));
const SubmissionId = () => Param("submissionId", new ParseUUIDPipe({ errorHttpStatusCode: 404 }));

/** Admin panel › Assignments: list, wizard create/edit, publish, duplicate, delete, submissions, grading, analytics. */
@ApiTags("Admin · Assignments")
@Controller("admin/assignments")
@RequireRoles("ADMIN")
@ValidateDto()
export class AdminAssignmentsController {
  constructor(
    private readonly query: AssignmentsQueryService,
    private readonly admin: AssignmentAdminService,
    private readonly submissions: AssignmentSubmissionsService,
  ) {}

  @Get()
  @RequirePermission("assignments", "view")
  @ApiOperation({ summary: "Paginated assignments (optionally one course's) with submission counters per row" })
  list(@CurrentUser() user: AuthUser, @Query() q: AssignmentQueryDto) {
    return this.query.list(user, q);
  }

  @Get("stats")
  @RequirePermission("assignments", "view")
  @ApiOperation({ summary: "Stat cards: total assignments, submissions, pending review, graded" })
  stats(@CurrentUser() user: AuthUser, @Query() q: AssignmentStatsQueryDto) {
    return this.query.stats(user, q);
  }

  @Get(":id")
  @RequirePermission("assignments", "view")
  detail(@CurrentUser() user: AuthUser, @AssignmentId() id: string) {
    return this.query.detail(user, id);
  }

  @Get(":id/insights")
  @RequirePermission("assignments", "view")
  @ApiOperation({ summary: "Overview + Analytics tabs: stats, grade distribution, histogram, daily activity, rubric performance, lists" })
  insights(@CurrentUser() user: AuthUser, @AssignmentId() id: string) {
    return this.query.insights(user, id);
  }

  @Get(":id/submissions")
  @RequirePermission("assignments", "view")
  @ApiOperation({ summary: "Paginated submissions with status / late / search filters" })
  listSubmissions(@CurrentUser() user: AuthUser, @AssignmentId() id: string, @Query() q: SubmissionQueryDto) {
    return this.query.submissions(user, id, q);
  }

  @Post()
  @RequirePermission("assignments", "manage")
  @ApiOperation({ summary: "Create from the wizard (PUBLISHED unless status: DRAFT)" })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAssignmentDto) {
    return this.admin.create(user, dto);
  }

  @Patch(":id")
  @RequirePermission("assignments", "manage")
  @ApiOperation({ summary: "Edit any subset of fields (wizard edit, rubric, instructions, publish / unpublish)" })
  update(@CurrentUser() user: AuthUser, @AssignmentId() id: string, @Body() dto: UpdateAssignmentDto) {
    return this.admin.update(user, id, dto);
  }

  @Post(":id/duplicate")
  @RequirePermission("assignments", "manage")
  @ApiOperation({ summary: "Copy as a draft without submissions" })
  duplicate(@CurrentUser() user: AuthUser, @AssignmentId() id: string) {
    return this.admin.duplicate(user, id);
  }

  @Post(":id/reminders")
  @HttpCode(200)
  @RequirePermission("assignments", "manage")
  @ApiOperation({ summary: "Email enrolled students who haven't submitted yet" })
  remind(@CurrentUser() user: AuthUser, @AssignmentId() id: string) {
    return this.submissions.sendPendingReminders(user, id);
  }

  @Delete(":id")
  @RequirePermission("assignments", "delete")
  @ApiOperation({ summary: "Delete the assignment and its submissions" })
  remove(@CurrentUser() user: AuthUser, @AssignmentId() id: string) {
    return this.admin.remove(user, id);
  }

  @Patch("submissions/:submissionId/grade")
  @RequirePermission("assignments", "manage")
  @ApiOperation({ summary: "Grade (or re-grade) a submission" })
  grade(@CurrentUser() user: AuthUser, @SubmissionId() submissionId: string, @Body() dto: GradeSubmissionDto) {
    return this.submissions.grade(user, submissionId, dto);
  }
}
