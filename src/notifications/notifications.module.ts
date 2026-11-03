import { Module } from "@nestjs/common";
import { MailService } from "../auth/mail/mail.service";
import { PrismaModule } from "../prisma/prisma.module";
import { AdminNotificationsController } from "./admin-notifications.controller";
import { BroadcastAdminService } from "./services/broadcast-admin.service";
import { BroadcastSenderService } from "./services/broadcast-sender.service";
import { BroadcastsQueryService } from "./services/broadcasts-query.service";
import { NotificationInboxService } from "./services/notification-inbox.service";
import { NotificationTemplatesService } from "./services/notification-templates.service";

/**
 * Admin panel › Notifications (/admin/notifications). Users read their own notifications through the legacy
 * NotificationModule (/notification) and course broadcasts through AnnouncementModule (/announcement), on the same tables.
 */
@Module({
  imports: [PrismaModule],
  controllers: [AdminNotificationsController],
  providers: [NotificationInboxService, BroadcastsQueryService, BroadcastAdminService, BroadcastSenderService, NotificationTemplatesService, MailService],
  exports: [NotificationInboxService],
})
export class NotificationsModule {}
