import { Module } from "@nestjs/common";
import { MailService } from "../auth/mail/mail.service";
import { PrismaModule } from "../prisma/prisma.module";
import { AdminLiveClassesController } from "./admin-live-classes.controller";
import { LiveClassAdminService } from "./services/live-class-admin.service";
import { LiveClassEventsService } from "./services/live-class-events.service";
import { LiveClassesQueryService } from "./services/live-classes-query.service";

/**
 * Admin panel › Live Classes (/admin/live-classes). Students use the legacy LiveClassModule (/live-class) and
 * AttendanceModule (/attendance), which log to the same Activity tab through LiveClassEventsService.
 */
@Module({
  imports: [PrismaModule],
  controllers: [AdminLiveClassesController],
  providers: [LiveClassesQueryService, LiveClassAdminService, LiveClassEventsService, MailService],
  exports: [LiveClassEventsService],
})
export class LiveClassesModule {}
