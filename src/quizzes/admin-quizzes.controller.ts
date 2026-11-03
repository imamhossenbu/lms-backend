import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser, RequireRoles, ValidateDto, type AuthUser } from "../common/auth-user";
import { PaginationQueryDto } from "../common/pagination";
import { RequirePermission } from "../team/permissions.guard";
import { AttemptQueryDto } from "./dto/attempt.dto";
import { CreateQuizDto, QuizQueryDto, QuizStatsQueryDto, UpdateQuizDto } from "./dto/quiz.dto";
import { QuizAdminService } from "./services/quiz-admin.service";
import { QuizzesQueryService } from "./services/quizzes-query.service";

const QuizId = () => Param("id", new ParseUUIDPipe({ errorHttpStatusCode: 404 }));

/** Admin panel › Quizzes: list, wizard create/edit, publish / unpublish / archive, duplicate, delete, attempts, analytics, activity. */
@ApiTags("Admin · Quizzes")
@Controller("admin/quizzes")
@RequireRoles("ADMIN")
@ValidateDto()
export class AdminQuizzesController {
  constructor(
    private readonly query: QuizzesQueryService,
    private readonly admin: QuizAdminService,
  ) {}

  @Get()
  @RequirePermission("quizzes", "view")
  @ApiOperation({ summary: "Paginated quizzes with attempt summaries" })
  list(@CurrentUser() user: AuthUser, @Query() q: QuizQueryDto) {
    return this.query.list(user, q);
  }

  @Get("stats")
  @RequirePermission("quizzes", "view")
  @ApiOperation({ summary: "Stat cards: totals per status and 30-day growth" })
  stats(@CurrentUser() user: AuthUser, @Query() q: QuizStatsQueryDto) {
    return this.query.stats(user, q);
  }

  @Get(":id")
  @RequirePermission("quizzes", "view")
  detail(@CurrentUser() user: AuthUser, @QuizId() id: string) {
    return this.query.detail(user, id);
  }

  @Get(":id/attempts")
  @RequirePermission("quizzes", "view")
  @ApiOperation({ summary: "Paginated attempts with passed / completed / search filters" })
  attempts(@CurrentUser() user: AuthUser, @QuizId() id: string, @Query() q: AttemptQueryDto) {
    return this.query.attempts(user, id, q);
  }

  @Get(":id/insights")
  @RequirePermission("quizzes", "view")
  @ApiOperation({ summary: "Metrics, trends, score / time distributions, per-question performance, top students, insight sentences" })
  insights(@CurrentUser() user: AuthUser, @QuizId() id: string) {
    return this.query.insights(user, id);
  }

  @Get(":id/activity")
  @RequirePermission("quizzes", "view")
  @ApiOperation({ summary: "Activity Log tab (newest first)" })
  activity(@CurrentUser() user: AuthUser, @QuizId() id: string, @Query() q: PaginationQueryDto) {
    return this.query.activity(user, id, q);
  }

  @Post()
  @RequirePermission("quizzes", "manage")
  @ApiOperation({ summary: "Create from the wizard (PUBLISHED unless status: DRAFT)" })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateQuizDto) {
    return this.admin.create(user, dto);
  }

  @Patch(":id")
  @RequirePermission("quizzes", "manage")
  @ApiOperation({ summary: "Edit any subset of fields, or change status (PUBLISHED / DRAFT / ARCHIVED)" })
  update(@CurrentUser() user: AuthUser, @QuizId() id: string, @Body() dto: UpdateQuizDto) {
    return this.admin.update(user, id, dto);
  }

  @Post(":id/duplicate")
  @RequirePermission("quizzes", "manage")
  @ApiOperation({ summary: "Copy as a draft without attempts" })
  duplicate(@CurrentUser() user: AuthUser, @QuizId() id: string) {
    return this.admin.duplicate(user, id);
  }

  @Delete(":id")
  @RequirePermission("quizzes", "delete")
  @ApiOperation({ summary: "Delete the quiz with its questions, attempts and activity" })
  remove(@CurrentUser() user: AuthUser, @QuizId() id: string) {
    return this.admin.remove(user, id);
  }
}
