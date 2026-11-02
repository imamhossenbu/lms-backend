import { Module } from "@nestjs/common";
import { MailService } from "../auth/mail/mail.service";
import { PrismaModule } from "../prisma/prisma.module";
import { InstructorRecordsController } from "./instructor-records.controller";
import { InstructorsController } from "./instructors.controller";
import { InstructorNotesService } from "./services/instructor-notes.service";
import { InstructorRecordsService } from "./services/instructor-records.service";
import { InstructorStatsService } from "./services/instructor-stats.service";
import { InstructorsService } from "./services/instructors.service";

/**
 * Admin panel › Instructors.
 *   /instructors                 list / create
 *   /instructors/:id             details / edit / status / delete / courses (assign) / messages
 *   /instructors/:id/{courses,students,reviews,schedule,activity,notes}
 * Scoped to the admin's institution (tenant).
 */
@Module({
  imports: [PrismaModule],
  controllers: [InstructorsController, InstructorRecordsController],
  providers: [InstructorsService, InstructorStatsService, InstructorRecordsService, InstructorNotesService, MailService],
  exports: [InstructorsService, InstructorStatsService],
})
export class InstructorsModule {}
