import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser, RequireRoles, ValidateDto, type AuthUser } from "../common/auth-user";
import { tenantOf } from "../common/tenancy";
import { AttemptQueryDto, GradeSubmissionDto, LiveQueryDto, QuestionQueryDto, ReplyDto, SubmissionQueryDto, TeacherPageQueryDto, TeacherPasswordDto, TeacherProfileDto } from "./dto/teacher.dto";
import { TeacherService } from "./teacher.service";

/** Teacher mode (admin panel /teach): a TEACHER's own courses, students, grading, quiz results, live classes, questions, profile. */
@ApiTags("Teacher")
@Controller("teacher")
@RequireRoles("TEACHER")
@ValidateDto()
export class TeacherController {
  constructor(private readonly teacher: TeacherService) {}

  @Get("dashboard")
  @ApiOperation({ summary: "Stats, upcoming live classes, recent submissions" })
  dashboard(@CurrentUser() u: AuthUser) {
    return this.teacher.dashboard(u.userId, tenantOf(u));
  }

  @Get("courses")
  courses(@CurrentUser() u: AuthUser) {
    return this.teacher.courses(u.userId, tenantOf(u));
  }

  @Get("courses/:id")
  course(@CurrentUser() u: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.teacher.course(u.userId, tenantOf(u), id);
  }

  @Get("students")
  students(@CurrentUser() u: AuthUser, @Query() q: TeacherPageQueryDto) {
    return this.teacher.students(u.userId, tenantOf(u), q);
  }

  @Get("submissions")
  submissions(@CurrentUser() u: AuthUser, @Query() q: SubmissionQueryDto) {
    return this.teacher.submissions(u.userId, tenantOf(u), q);
  }

  @Patch("submissions/:id/grade")
  @ApiOperation({ summary: "Grade a submission of one of my courses (marks ≤ assignment marks)" })
  grade(@CurrentUser() u: AuthUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: GradeSubmissionDto) {
    return this.teacher.grade(u.userId, tenantOf(u), id, dto.marks, dto.feedback);
  }

  @Get("quiz-attempts")
  attempts(@CurrentUser() u: AuthUser, @Query() q: AttemptQueryDto) {
    return this.teacher.attempts(u.userId, tenantOf(u), q);
  }

  @Get("live-classes")
  live(@CurrentUser() u: AuthUser, @Query() q: LiveQueryDto) {
    return this.teacher.liveClasses(u.userId, tenantOf(u), q.when ?? "upcoming");
  }

  @Get("questions")
  questions(@CurrentUser() u: AuthUser, @Query() q: QuestionQueryDto) {
    return this.teacher.questions(u.userId, tenantOf(u), q);
  }

  @Post("questions/:id/reply")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  reply(@CurrentUser() u: AuthUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: ReplyDto) {
    return this.teacher.reply(u.userId, tenantOf(u), id, dto.body);
  }

  @Get("profile")
  profile(@CurrentUser() u: AuthUser) {
    return this.teacher.profile(u.userId);
  }

  @Patch("profile")
  updateProfile(@CurrentUser() u: AuthUser, @Body() dto: TeacherProfileDto) {
    return this.teacher.updateProfile(u.userId, dto);
  }

  @Post("password")
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  password(@CurrentUser() u: AuthUser, @Body() dto: TeacherPasswordDto) {
    return this.teacher.changePassword(u.userId, dto.currentPassword, dto.newPassword);
  }
}
