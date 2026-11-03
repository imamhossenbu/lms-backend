import { ForbiddenException, Injectable } from "@nestjs/common";
import type { AuthUser } from "../common/auth-user";
import { PrismaService } from "../prisma/prisma.service";
import { toBroadcast } from "../notifications/notification.mapper";

export interface CourseAnnouncement {
  id: string;
  title: string;
  message: string;
  messageHtml: string;
  priority: string;
  ctaLabel: string;
  ctaUrl: string;
  sentAt: string | null;
}

/** Read-only course announcements = SENT broadcasts that targeted the course (incl. legacy per-course rows). */
@Injectable()
export class AnnouncementService {
  constructor(private readonly prisma: PrismaService) {}

  async getAllByCourse(user: AuthUser, courseId: string): Promise<CourseAnnouncement[]> {
    if (user.role === "STUDENT") {
      const enrolled = await this.prisma.enrollment.findFirst({ where: { userId: user.userId, courseId }, select: { id: true } });
      if (!enrolled) throw new ForbiddenException("Enroll in this course to see its announcements.");
    }
    const rows = await this.prisma.announcement.findMany({
      where: { institutionId: user.institutionId ?? null, status: "SENT", OR: [{ courseIds: { has: courseId } }, { courseId }] },
      orderBy: [{ sendAt: "desc" }, { createdAt: "desc" }],
      take: 100,
    });
    return rows.map((r) => {
      const b = toBroadcast(r, "");
      return { id: b.id, title: b.title, message: r.message, messageHtml: b.messageHtml, priority: b.priority, ctaLabel: b.ctaLabel, ctaUrl: b.ctaUrl, sentAt: b.sendAt };
    });
  }
}
