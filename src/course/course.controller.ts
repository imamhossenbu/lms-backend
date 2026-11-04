import { ValidateDto } from "../common/auth-user";
import { StaffPermission } from "../team/permissions.guard";
import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Patch,
  Param,
  Delete,
  Query,
  BadRequestException,
} from "@nestjs/common";
import { CourseService } from "./course.service";
import { CreateCourseDto, UpdateCourseDto } from "./dto/course.dto";
import { CourseQueryDto } from "./dto/course-query.dto";
import { AuthGuard } from "@nestjs/passport";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { FileInterceptor } from "@nestjs/platform-express";
import { RequestWithUser } from "../auth/interfaces/request.interface";
import { OptionalJwtGuard } from "../common/optional-jwt.guard";
import { resolvePublicTenant, tenantOf } from "../common/tenancy";
import { PrismaService } from "../prisma/prisma.service";

@Controller("courses")
@ValidateDto()
export class CourseController {
  constructor(
    private readonly courseService: CourseService,
    private readonly prisma: PrismaService,
  ) {}

  @StaffPermission("courses", "manage")
  @Post("upload-thumbnail")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN", "TEACHER")
  @UseInterceptors(FileInterceptor("file"))
  async uploadThumbnail(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException("No image file provided");
    }
    const url = await this.courseService.uploadThumbnail(file);
    return { url };
  }

  @StaffPermission("courses", "manage")
  @Post("upload-media")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN", "TEACHER")
  @UseInterceptors(FileInterceptor("file"))
  async uploadMedia(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException("No file provided");
    }
    const url = await this.courseService.uploadMedia(file);
    return { url };
  }

  @StaffPermission("courses", "manage")
  @Post()
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN", "TEACHER")
  @UseInterceptors(FileInterceptor("thumbnail"))
  async create(
    @Body() dto: CreateCourseDto,
    @Req() req: RequestWithUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.courseService.create(dto, req.user.userId, tenantOf(req.user), file);
  }

  /** Public catalogue: the signed-in user's workspace, or `?institution=<slug>`, or the legacy workspace. */
  @Get()
  @UseGuards(OptionalJwtGuard)
  async findAll(@Query() query: CourseQueryDto, @Query("institution") institution: string | undefined, @Req() req: Partial<RequestWithUser>) {
    return this.courseService.findAll(await resolvePublicTenant(this.prisma, req.user as any, institution), query);
  }

  @Get(":id")
  @UseGuards(OptionalJwtGuard)
  async getOne(@Param("id") id: string, @Query("institution") institution: string | undefined, @Req() req: Partial<RequestWithUser>) {
    return this.courseService.findOne(id, await resolvePublicTenant(this.prisma, req.user as any, institution));
  }

  @StaffPermission("courses", "manage")
  @Patch(":id")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN", "TEACHER")
  @UseInterceptors(FileInterceptor("thumbnail"))
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateCourseDto,
    @Req() req: RequestWithUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.courseService.update(id, req.user.userId, req.user.role, tenantOf(req.user), dto, file);
  }

  @StaffPermission("courses", "delete")
  @Delete(":id")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN", "TEACHER")
  async delete(@Param("id") id: string, @Req() req: RequestWithUser) {
    return this.courseService.delete(id, req.user.userId, req.user.role, tenantOf(req.user));
  }
}
