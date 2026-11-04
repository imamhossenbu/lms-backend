import { ValidateDto } from "../common/auth-user";
import { StaffPermission } from "../team/permissions.guard";
import { CatalogAccessGuard, CatalogId } from "../common/catalog-access.guard";
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
@ValidateDto()
@UseGuards(AuthGuard("jwt"), RolesGuard, CatalogAccessGuard)
@CatalogId("module")
export class CourseModuleController {
  constructor(private readonly moduleService: CourseModuleService) {}

  @StaffPermission("courses", "manage")
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

  @StaffPermission("courses", "manage")
  @Patch(":id")
  @Roles("ADMIN", "TEACHER")
  async update(@Param("id") id: string, @Body() dto: UpdateModuleDto) {
    return this.moduleService.update(id, dto);
  }

  @StaffPermission("courses", "manage")
  @Delete(":id")
  @Roles("ADMIN", "TEACHER")
  async delete(@Param("id") id: string) {
    return this.moduleService.delete(id);
  }
}
