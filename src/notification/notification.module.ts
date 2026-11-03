import { Module } from "@nestjs/common";
import { NotificationInboxService } from "../notifications/services/notification-inbox.service";
import { PrismaModule } from "../prisma/prisma.module";
import { NotificationController } from "./notification.controller";
import { NotificationService } from "./notification.service";

/** User-facing notifications (/notification) + NotificationService.notify for other domains. */
@Module({
  imports: [PrismaModule],
  providers: [NotificationService, NotificationInboxService],
  controllers: [NotificationController],
  exports: [NotificationService],
})
export class NotificationModule {}
