import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationTemplates } from "./notification.types";

@Injectable()
export class NotificationService {
  constructor(private prisma: PrismaService) {}

  async notify(
    userId: string,
    templateKey: keyof typeof NotificationTemplates,
    ...args: any[]
  ) {
    const template = NotificationTemplates[templateKey];
    const message = (template.message as any)(...args);

    return await this.prisma.notification.create({
      data: {
        userId,
        title: template.title,
        message: message,
        type: template.type,
      },
    });
  }

  async getMyNotifications(userId: string) {
    return await this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  }

  async markAsRead(notificationId: string, userId: string) {
    return await this.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { isRead: true },
    });
  }
}
