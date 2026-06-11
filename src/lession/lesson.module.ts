import { Module } from "@nestjs/common";
import { LessonService } from "./lesson.service";
import { LessonController } from "./lesson.controller";
import { PrismaModule } from "../prisma/prisma.module";
import { DurationService } from "../Duration/duration.service";

@Module({
  imports: [PrismaModule],
  controllers: [LessonController],
  providers: [LessonService,DurationService],
  exports: [LessonService], 
})
export class LessonModule {}
