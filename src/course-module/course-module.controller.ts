import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from "@nestjs/common";
import { CourseModuleService } from "./course-module.service";
import { CreateModuleDto, UpdateModuleDto } from "./dto/module.dto";
import { AuthGuard } from "@nestjs/passport";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";

@Controller("courses/:courseId/modules")
@UseGuards(AuthGuard("jwt"), RolesGuard)
export class CourseModuleController {
  constructor(private readonly moduleService: CourseModuleService) {}

  @Post()
  @Roles("ADMIN", "TEACHER")
  async create(
    @Param("courseId") courseId: string,
    @Body() dto: CreateModuleDto,
  ) {
    return this.moduleService.create(courseId, dto);
  }

  @Get()
  async findAll(@Param("courseId") courseId: string) {
    return this.moduleService.findAllByCourse(courseId);
  }

  @Patch(":id")
  @Roles("ADMIN", "TEACHER")
  async update(@Param("id") id: string, @Body() dto: UpdateModuleDto) {
    return this.moduleService.update(id, dto);
  }

  @Delete(":id")
  @Roles("ADMIN", "TEACHER")
  async delete(@Param("id") id: string) {
    return this.moduleService.delete(id);
  }
}
