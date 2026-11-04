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
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { LessonResourceService } from "./lesson-resource.service";
import { CreateLessonResourceDto, UpdateLessonResourceDto } from "./dto/resource.dto";
import { AuthGuard } from "@nestjs/passport";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";

@Controller("lessons/:lessonId/resources")
@ValidateDto()
@UseGuards(AuthGuard("jwt"), RolesGuard, CatalogAccessGuard)
@CatalogId("resource")
export class LessonResourceController {
  constructor(private readonly resourceService: LessonResourceService) {}

  @StaffPermission("courses", "manage")
  @Post()
  @Roles("ADMIN", "TEACHER")
  @UseInterceptors(FileInterceptor("file"))
  async create(
    @Param("lessonId") lessonId: string,
    @Body() dto: CreateLessonResourceDto,
    @UploadedFile(
      new ParseFilePipe({
        fileIsRequired: false,
        validators: [new MaxFileSizeValidator({ maxSize: 1024 * 1024 * 50 })],
      }),
    )
    file: Express.Multer.File | undefined,
  ) {
    return this.resourceService.create(lessonId, dto, file);
  }

  @Get()
  async findAll(@Param("lessonId") lessonId: string) {
    return this.resourceService.findAllByLesson(lessonId);
  }
  @StaffPermission("courses", "manage")
  @Patch(":id")
  @Roles("ADMIN", "TEACHER")
  @UseInterceptors(FileInterceptor("file"))
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateLessonResourceDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.resourceService.update(id, dto, file);
  }

  @StaffPermission("courses", "manage")
  @Delete(":id")
  @Roles("ADMIN", "TEACHER")
  async delete(@Param("id") id: string) {
    return this.resourceService.delete(id);
  }
}
