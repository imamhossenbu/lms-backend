import { Module } from "@nestjs/common";
import { MailService } from "../auth/mail/mail.service";
import { PrismaModule } from "../prisma/prisma.module";
import { StudentEnrollmentsService } from "./services/student-enrollments.service";
import { StudentNotesService } from "./services/student-notes.service";
import { StudentProgressService } from "./services/student-progress.service";
import { StudentsService } from "./services/students.service";
import { StudentRecordsController } from "./student-records.controller";
import { StudentsController } from "./students.controller";

/**
 * Admin panel › Students.
 *   /students                 list / create
 *   /students/:id             details / edit / status / delete
 *   /students/:id/{courses,quizzes,assignments,certificates,activity,notes,enrollments}
 * Scoped to the admin's institution (tenant) — see common/auth-user.ts `tenantWhere`.
 */
@Module({
  imports: [PrismaModule],
  controllers: [StudentsController, StudentRecordsController],
  providers: [StudentsService, StudentProgressService, StudentEnrollmentsService, StudentNotesService, MailService],
  exports: [StudentsService, StudentProgressService],
})
export class StudentsModule {}
