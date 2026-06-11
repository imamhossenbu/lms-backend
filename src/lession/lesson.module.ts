import { Module } from "@nestjs/common";
import { LessonService } from "./lesson.service";
import { LessonController } from "./lesson.controller";
import { PrismaModule } from "../prisma/prisma.module";
import { DurationService } from "../Duration/duration.service";
import { EnrollmentModule } from "../enrollment/enrollment.module";

@Module({
  imports: [PrismaModule,EnrollmentModule],
  controllers: [LessonController],
  providers: [LessonService,DurationService],
  exports: [LessonService], 
})
export class LessonModule {}
