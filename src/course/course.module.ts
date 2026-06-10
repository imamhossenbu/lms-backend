import { Module } from "@nestjs/common";
import { CourseController } from "./course.controller";
import { CourseService } from "./course.service";
import { PrismaModule } from "../prisma/prisma.module";
import { CloudinaryService } from "../cloudinary/cloudinary.service";

@Module({
  imports: [PrismaModule],
  controllers: [CourseController],
  providers: [CourseService, CloudinaryService],
  exports: [CourseService],
})
export class CourseModule {}
