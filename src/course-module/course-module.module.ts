import { Module } from "@nestjs/common";
import { CourseModuleService } from "./course-module.service";
import { CourseModuleController } from "./course-module.controller";
import { PrismaModule } from "../prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  controllers: [CourseModuleController],
  providers: [CourseModuleService],
})
export class CourseModuleModule {}
