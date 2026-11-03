import { Module } from "@nestjs/common";
import { MailService } from "../auth/mail/mail.service";
import { PrismaModule } from "../prisma/prisma.module";
import { AdminAssignmentsController } from "./admin-assignments.controller";
import { AssignmentAdminService } from "./services/assignment-admin.service";
import { AssignmentSubmissionsService } from "./services/assignment-submissions.service";
import { AssignmentsQueryService } from "./services/assignments-query.service";

/**
 * Admin panel › Assignments (/admin/assignments). Students submit through the legacy AssignmentModule
 * (/assignment/:id/submit), which shares the same tables and rules.
 */
@Module({
  imports: [PrismaModule],
  controllers: [AdminAssignmentsController],
  providers: [AssignmentsQueryService, AssignmentAdminService, AssignmentSubmissionsService, MailService],
  exports: [AssignmentsQueryService],
})
export class AssignmentsModule {}
