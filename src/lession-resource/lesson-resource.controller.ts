import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  UseGuards,
} from "@nestjs/common";
import { LessonResourceService } from "./lesson-resource.service";
import { CreateLessonResourceDto } from "./dto/resource.dto";
import { AuthGuard } from "@nestjs/passport";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";

@Controller("lessons/:lessonId/resources")
@UseGuards(AuthGuard("jwt"), RolesGuard)
export class LessonResourceController {
  constructor(private readonly resourceService: LessonResourceService) {}

  @Post()
  @Roles("ADMIN", "TEACHER")
  async create(
    @Param("lessonId") lessonId: string,
    @Body() dto: CreateLessonResourceDto,
  ) {
    return this.resourceService.create(lessonId, dto);
  }

  @Get()
  async findAll(@Param("lessonId") lessonId: string) {
    return this.resourceService.findAllByLesson(lessonId);
  }

  @Delete(":id")
  @Roles("ADMIN", "TEACHER")
  async delete(@Param("id") id: string) {
    return this.resourceService.delete(id);
  }
}
