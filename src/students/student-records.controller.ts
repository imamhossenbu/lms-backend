import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser, RequireRoles, ValidateDto, type AuthUser } from "../common/auth-user";
import { RequirePermission } from "../team/permissions.guard";
import { EnrollCoursesDto, StudentNoteDto } from "./dto/student.dto";
import { StudentEnrollmentsService } from "./services/student-enrollments.service";
import { StudentNotesService } from "./services/student-notes.service";
import { StudentProgressService } from "./services/student-progress.service";
import { StudentsService } from "./services/students.service";
import { StudentId } from "./students.controller";
import { STUDENT_MANAGER_ROLES } from "./students.constants";

const Uuid = (name: string) => Param(name, new ParseUUIDPipe({ errorHttpStatusCode: 404 }));

/** Admin panel › Student details tabs: courses, quizzes, assignments, certificates, activity, notes. */
@ApiTags("Students")
@Controller("students/:id")
@RequireRoles(...STUDENT_MANAGER_ROLES)
@ValidateDto()
export class StudentRecordsController {
  constructor(
    private readonly students: StudentsService,
    private readonly progress: StudentProgressService,
    private readonly enrollments: StudentEnrollmentsService,
    private readonly notes: StudentNotesService,
  ) {}

  // ---------------------------------------------------------------- learning records (read-only)

  @Get("courses")
  @ApiOperation({ summary: "Enrolled courses with progress" })
  @RequirePermission("students", "view")
  async courses(@CurrentUser() user: AuthUser, @StudentId() id: string) {
    await this.students.mustFind(user, id);
    return this.progress.courses(id);
  }

  @Get("quizzes")
  @ApiOperation({ summary: "Quizzes in enrolled courses with best attempt" })
  @RequirePermission("students", "view")
  async quizzes(@CurrentUser() user: AuthUser, @StudentId() id: string) {
    await this.students.mustFind(user, id);
    return this.progress.quizzes(id);
  }

  @Get("assignments")
  @ApiOperation({ summary: "Assignments in enrolled courses with submission status" })
  @RequirePermission("students", "view")
  async assignments(@CurrentUser() user: AuthUser, @StudentId() id: string) {
    await this.students.mustFind(user, id);
    return this.progress.assignments(id);
  }

  @Get("certificates")
  @RequirePermission("students", "view")
  async certificates(@CurrentUser() user: AuthUser, @StudentId() id: string) {
    await this.students.mustFind(user, id);
    return this.progress.certificates(id);
  }

  @Get("activity")
  @ApiOperation({ summary: "Learning timeline, newest first" })
  @RequirePermission("students", "view")
  async activity(@CurrentUser() user: AuthUser, @StudentId() id: string) {
    const student = await this.students.mustFind(user, id);
    return this.progress.activity(id, student.createdAt);
  }

  // ---------------------------------------------------------------- enrollments

  @Post("enrollments")
  @ApiOperation({ summary: "Enroll the student in courses (already-enrolled ones are skipped)" })
  @RequirePermission("students", "manage")
  async enroll(@CurrentUser() user: AuthUser, @StudentId() id: string, @Body() dto: EnrollCoursesDto) {
    await this.students.mustFind(user, id);
    return this.enrollments.enroll(id, dto.courseIds);
  }

  @Delete("enrollments/:courseId")
  @RequirePermission("students", "manage")
  async unenroll(@CurrentUser() user: AuthUser, @StudentId() id: string, @Uuid("courseId") courseId: string) {
    await this.students.mustFind(user, id);
    return this.enrollments.unenroll(id, courseId);
  }

  // ---------------------------------------------------------------- notes

  @Get("notes")
  @RequirePermission("students", "view")
  async listNotes(@CurrentUser() user: AuthUser, @StudentId() id: string) {
    await this.students.mustFind(user, id);
    return this.notes.list(id);
  }

  @Post("notes")
  @RequirePermission("students", "manage")
  async createNote(@CurrentUser() user: AuthUser, @StudentId() id: string, @Body() dto: StudentNoteDto) {
    await this.students.mustFind(user, id);
    return this.notes.create(user, id, dto);
  }

  @Patch("notes/:noteId")
  @RequirePermission("students", "manage")
  async updateNote(@CurrentUser() user: AuthUser, @StudentId() id: string, @Uuid("noteId") noteId: string, @Body() dto: StudentNoteDto) {
    await this.students.mustFind(user, id);
    return this.notes.update(user, id, noteId, dto);
  }

  @Delete("notes/:noteId")
  @RequirePermission("students", "manage")
  async deleteNote(@CurrentUser() user: AuthUser, @StudentId() id: string, @Uuid("noteId") noteId: string) {
    await this.students.mustFind(user, id);
    return this.notes.remove(user, id, noteId);
  }
}
