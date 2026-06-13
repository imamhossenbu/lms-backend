import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  UseGuards,
  Req,
  UseInterceptors,
  UploadedFile,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { AssignmentService } from "./assignment.service";
import { AuthGuard } from "@nestjs/passport";
import { Roles } from "../auth/decorators/roles.decorator";
import { RolesGuard } from "../auth/guards/roles.guard";

@Controller("assignment")
@UseGuards(AuthGuard("jwt"))
export class AssignmentController {
  constructor(private readonly service: AssignmentService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles("TEACHER", "ADMIN")
  async create(@Body() body: any) {
    return this.service.create(body);
  }

  @Get("course/:courseId")
  async findAll(@Param("courseId") courseId: string) {
    return this.service.findAll(courseId);
  }

  @Post(":assignmentId/submit")
  @UseInterceptors(FileInterceptor("file"))
  async submit(
    @Param("assignmentId") assignmentId: string,
    @Req() req: any,
    @Body() dto: any,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.service.submit(assignmentId, req.user.userId, dto, file);
  }

  @Patch("grade/:submissionId")
  @UseGuards(RolesGuard)
  @Roles("TEACHER", "ADMIN")
  async grade(@Param("submissionId") id: string, @Body() body: any) {
    return this.service.grade(id, body);
  }
}
