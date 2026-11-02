import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser, RequireRoles, ValidateDto, type AuthUser } from "../common/auth-user";
import { CreateStudentDto, StudentQueryDto, UpdateStudentDto, UpdateStudentStatusDto } from "./dto/student.dto";
import { StudentsService } from "./services/students.service";
import { STUDENT_MANAGER_ROLES } from "./students.constants";

export const StudentId = () => Param("id", new ParseUUIDPipe({ errorHttpStatusCode: 404 }));

/** Admin panel › Students (list, create, details header, edit, status, delete). */
@ApiTags("Students")
@Controller("students")
@RequireRoles(...STUDENT_MANAGER_ROLES)
@ValidateDto()
export class StudentsController {
  constructor(private readonly students: StudentsService) {}

  @Get()
  @ApiOperation({ summary: "Paginated students with search, status and course filters" })
  list(@CurrentUser() user: AuthUser, @Query() query: StudentQueryDto) {
    return this.students.list(user, query);
  }

  @Get(":id")
  @ApiOperation({ summary: "Student profile + learning metrics" })
  detail(@CurrentUser() user: AuthUser, @StudentId() id: string) {
    return this.students.detail(user, id);
  }

  @Post()
  @ApiOperation({ summary: "Create a student (auto-generated password emailed) and enroll selected courses" })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateStudentDto) {
    return this.students.create(user, dto);
  }

  @Patch(":id")
  update(@CurrentUser() user: AuthUser, @StudentId() id: string, @Body() dto: UpdateStudentDto) {
    return this.students.update(user, id, dto);
  }

  @Patch(":id/status")
  setStatus(@CurrentUser() user: AuthUser, @StudentId() id: string, @Body() dto: UpdateStudentStatusDto) {
    return this.students.setStatus(user, id, dto.status);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Soft-delete a student (records kept, login blocked)" })
  remove(@CurrentUser() user: AuthUser, @StudentId() id: string) {
    return this.students.remove(user, id);
  }
}
