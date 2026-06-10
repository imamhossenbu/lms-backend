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
} from "@nestjs/common";
import { CourseService } from "./course.service";
import { CreateCourseDto, UpdateCourseDto } from "./dto/course.dto";
import { AuthGuard } from "@nestjs/passport";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { FileInterceptor } from "@nestjs/platform-express";
import { RequestWithUser } from "../auth/interfaces/request.interface";

@Controller("courses")
export class CourseController {
  constructor(private readonly courseService: CourseService) {}

  @Post()
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN", "TEACHER")
  @UseInterceptors(FileInterceptor("thumbnail"))
  async create(
    @Body() dto: CreateCourseDto,
    @Req() req: RequestWithUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.courseService.create(dto, req.user.userId, file);
  }

  @Get()
  async findAll() {
    return this.courseService.findAll();
  }

  @Get(":id")
  async getOne(@Param("id") id: string) {
    return this.courseService.findOne(id);
  }

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
    return this.courseService.update(
      id,
      req.user.userId,
      req.user.role,
      dto,
      file,
    );
  }

  @Delete(":id")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN", "TEACHER")
  async delete(@Param("id") id: string, @Req() req: RequestWithUser) {
    return this.courseService.delete(id);
  }
}
