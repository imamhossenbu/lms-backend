import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from "@nestjs/common";
import { CourseService } from "./course.service";
import { CreateCourseDto } from "./dto/course.dto";
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
}
