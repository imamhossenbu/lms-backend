import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../prisma/prisma.module";
import { DurationService } from "../Duration/duration.service";
import { TeacherContentController } from "./teacher-content.controller";
import { TeacherContentService } from "./teacher-content.service";
import { TeacherController } from "./teacher.controller";
import { TeacherService } from "./teacher.service";

/** Teacher mode for the admin panel (/teach): /teacher/* scoped to the signed-in TEACHER's own courses. */
@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [TeacherController, TeacherContentController],
  providers: [TeacherService, TeacherContentService, DurationService],
})
export class TeacherModule {}
