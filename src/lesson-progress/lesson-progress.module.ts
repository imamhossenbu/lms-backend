
import { Module } from "@nestjs/common";

import { PrismaModule } from "../prisma/prisma.module";
import { EnrollmentModule } from "../enrollment/enrollment.module";
import { ProgressController } from "./progress.controller";
import { LessonProgressService } from "./lesson-progress.service";

@Module({
  imports: [PrismaModule, EnrollmentModule],
  controllers: [ProgressController],
  providers: [LessonProgressService],
  exports: [LessonProgressService],
})
export class LessonProgressModule {}
