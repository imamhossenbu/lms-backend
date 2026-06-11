import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Req as NestReq,
} from "@nestjs/common";
import { LessonService } from "./lesson.service";
import { CreateLessonDto, UpdateLessonDto } from "./dto/lesson.dto";
import { AuthGuard } from "@nestjs/passport";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";

@Controller("courses/:courseId/modules/:moduleId/lessons")
@UseGuards(AuthGuard("jwt"), RolesGuard)
export class LessonController {
  constructor(private readonly lessonService: LessonService) {}

  @Post()
  @Roles("ADMIN", "TEACHER")
  async create(
    @Param("courseId") courseId: string,
    @Param("moduleId") moduleId: string,
    @Body() dto: CreateLessonDto,
  ) {
    return this.lessonService.create(courseId, moduleId, dto);
  }

  @Get()
  async findAll(@Param("moduleId") moduleId: string) {
    return this.lessonService.findAllByModule(moduleId);
  }

  @Patch(":id")
  @Roles("ADMIN", "TEACHER")
  async update(@Param("id") id: string, @Body() dto: UpdateLessonDto) {
    return this.lessonService.update(id, dto);
  }

  @Delete(":id")
  @Roles("ADMIN", "TEACHER")
  async delete(@Param("id") id: string) {
    return this.lessonService.delete(id);
  }

  @Post(":id/complete")
  @Roles("STUDENT", "ADMIN")
  async complete(@Req() req: any, @Param("id") lessonId: string) {
    const userId = req.user.userId;
    return await this.lessonService.completeLesson(userId, lessonId);
  }
}
function Req(): (
  target: LessonController,
  propertyKey: "complete",
  parameterIndex: 0,
) => void {
  return NestReq();
}
