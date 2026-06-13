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
  @Roles("TEACHER")
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
    @Req() req: any,
    @Param("assignmentId") id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body("textAnswer") textAnswer: string,
  ) {
    const fileUrl = file ? `/uploads/assignments/${file.filename}` : "";
    return this.service.submit(req.user.userId, id, { fileUrl, textAnswer });
  }

  @Patch("grade/:submissionId")
  @UseGuards(RolesGuard)
  @Roles("TEACHER")
  async grade(@Param("submissionId") id: string, @Body() body: any) {
    return this.service.grade(id, body);
  }
}
