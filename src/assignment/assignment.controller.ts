import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiConsumes, ApiOperation, ApiTags } from "@nestjs/swagger";
import { SubmitAssignmentDto } from "../assignments/dto/submission.dto";
import { CurrentUser, RequireRoles, ValidateDto, type AuthUser } from "../common/auth-user";
import { AssignmentService } from "./assignment.service";

const Id = (name: string) => Param(name, new ParseUUIDPipe({ errorHttpStatusCode: 404 }));

/**
 * Student side of assignments: read published work of enrolled courses, submit, see own submissions.
 * Admins manage assignments and grade at /admin/assignments.
 */
@ApiTags("Assignments (student)")
@Controller("assignment")
@RequireRoles("STUDENT", "ADMIN")
@ValidateDto()
export class AssignmentController {
  constructor(private readonly service: AssignmentService) {}

  @Get("my-submissions")
  getMySubmissions(@CurrentUser() user: AuthUser) {
    return this.service.getMySubmissions(user.userId);
  }

  @Get("course/:courseId")
  @ApiOperation({ summary: "Published assignments of a course the student is enrolled in" })
  findAll(@CurrentUser() user: AuthUser, @Id("courseId") courseId: string) {
    return this.service.findAll(user, courseId);
  }

  @Get(":id")
  findOne(@CurrentUser() user: AuthUser, @Id("id") id: string) {
    return this.service.findOne(user, id);
  }

  @Post(":assignmentId/submit")
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 500 * 1024 * 1024 } }))
  submit(
    @CurrentUser() user: AuthUser,
    @Id("assignmentId") assignmentId: string,
    @Body() dto: SubmitAssignmentDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.service.submit(user, assignmentId, dto, file);
  }
}
