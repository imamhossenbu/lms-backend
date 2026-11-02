import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser, RequireRoles, ValidateDto, type AuthUser } from "../common/auth-user";
import { RequirePermission } from "../team/permissions.guard";
import {
  AssignCoursesDto,
  CreateInstructorDto,
  InstructorMessageDto,
  InstructorQueryDto,
  UpdateInstructorDto,
  UpdateInstructorStatusDto,
} from "./dto/instructor.dto";
import { INSTRUCTOR_MANAGER_ROLES } from "./instructors.constants";
import { InstructorsService } from "./services/instructors.service";

export const InstructorId = () => Param("id", new ParseUUIDPipe({ errorHttpStatusCode: 404 }));

/** Admin panel › Instructors (list, create, details header, edit, status, delete, course assignment, message). */
@ApiTags("Instructors")
@Controller("instructors")
@RequireRoles(...INSTRUCTOR_MANAGER_ROLES)
@ValidateDto()
export class InstructorsController {
  constructor(private readonly instructors: InstructorsService) {}

  @Get()
  @ApiOperation({ summary: "Paginated instructors with search and status filter" })
  @RequirePermission("instructors", "view")
  list(@CurrentUser() user: AuthUser, @Query() query: InstructorQueryDto) {
    return this.instructors.list(user, query);
  }

  @Get(":id")
  @ApiOperation({ summary: "Instructor profile + teaching stats" })
  @RequirePermission("instructors", "view")
  detail(@CurrentUser() user: AuthUser, @InstructorId() id: string) {
    return this.instructors.detail(user, id);
  }

  @Post()
  @ApiOperation({ summary: "Create an instructor (auto-generated password emailed) and optionally assign courses" })
  @RequirePermission("instructors", "manage")
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateInstructorDto) {
    return this.instructors.create(user, dto);
  }

  @Patch(":id")
  @RequirePermission("instructors", "manage")
  update(@CurrentUser() user: AuthUser, @InstructorId() id: string, @Body() dto: UpdateInstructorDto) {
    return this.instructors.update(user, id, dto);
  }

  @Patch(":id/status")
  @RequirePermission("instructors", "manage")
  setStatus(@CurrentUser() user: AuthUser, @InstructorId() id: string, @Body() dto: UpdateInstructorStatusDto) {
    return this.instructors.setStatus(user, id, dto.status);
  }

  @Post(":id/courses")
  @HttpCode(200)
  @ApiOperation({ summary: "Assign courses to this instructor (moves them from their current instructor)" })
  @RequirePermission("instructors", "manage")
  assignCourses(@CurrentUser() user: AuthUser, @InstructorId() id: string, @Body() dto: AssignCoursesDto) {
    return this.instructors.assignCourses(user, id, dto.courseIds);
  }

  @Post(":id/messages")
  @HttpCode(200)
  @ApiOperation({ summary: "Email a message to the instructor" })
  @RequirePermission("instructors", "manage")
  sendMessage(@CurrentUser() user: AuthUser, @InstructorId() id: string, @Body() dto: InstructorMessageDto) {
    return this.instructors.sendMessage(user, id, dto);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Soft-delete an instructor (refused while they still own courses)" })
  @RequirePermission("instructors", "delete")
  remove(@CurrentUser() user: AuthUser, @InstructorId() id: string) {
    return this.instructors.remove(user, id);
  }
}
