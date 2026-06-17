import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class NotificationService {
  constructor(private prisma: PrismaService) {}

  async createTemplate(data: {
    slug: string;
    title: string;
    message: string;
    type: string;
  }) {
    return await this.prisma.notificationTemplate.create({ data });
  }

  async getAllTemplates() {
    return await this.prisma.notificationTemplate.findMany();
  }

  async updateTemplate(id: string, data: { title: string; message: string }) {
    return await this.prisma.notificationTemplate.update({
      where: { id },
      data: { title: data.title, message: data.message },
    });
  }

  async notify(
    userId: string,
    slug: string,
    replacements: Record<string, string>,
  ) {
    const template = await this.prisma.notificationTemplate.findUnique({
      where: { slug },
    });
    if (!template) throw new NotFoundException("Template not found");

    let message = template.message;
    Object.keys(replacements).forEach((key) => {
      message = message.replace(`{{${key}}}`, replacements[key]);
    });

    return await this.prisma.notification.create({
      data: { userId, title: template.title, message, type: template.type },
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
