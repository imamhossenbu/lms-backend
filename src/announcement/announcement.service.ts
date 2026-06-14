import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AnnouncementService {
  constructor(private prisma: PrismaService) {}

  async create(data: {
    courseId: string;
    createdBy: string;
    title: string;
    message: string;
    targetRole: string;
  }) {
    return await this.prisma.announcement.create({ data });
  }

  async getAllByCourse(courseId: string) {
    return await this.prisma.announcement.findMany({
      where: { courseId },
      orderBy: { createdAt: "desc" },
    });
  }

  async update(
    id: string,
    data: { title?: string; message?: string; targetRole?: string },
  ) {
    const announcement = await this.prisma.announcement.findUnique({
      where: { id },
    });
    if (!announcement) throw new NotFoundException("Announcement not found");

    return await this.prisma.announcement.update({
      where: { id },
      data,
    });
  }

  async delete(id: string) {
    const announcement = await this.prisma.announcement.findUnique({
      where: { id },
    });
    if (!announcement) throw new NotFoundException("Announcement not found");

    return await this.prisma.announcement.delete({ where: { id } });
  }
}
