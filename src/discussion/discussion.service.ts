import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class DiscussionService {
  constructor(private prisma: PrismaService) {}

  // --- Discussion ---
  async createDiscussion(
    userId: string,
    data: { courseId: string; title: string; body: string; tags?: string },
  ) {
    return await this.prisma.discussion.create({ data: { ...data, userId } });
  }

  async findAllByCourse(courseId: string) {
    return await this.prisma.discussion.findMany({
      where: { courseId },
      include: { replies: true }, 
      orderBy: { createdAt: "desc" },
    });
  }

  async updateDiscussion(
    id: string,
    userId: string,
    data: { title: string; body: string },
  ) {
    const discussion = await this.prisma.discussion.findUnique({
      where: { id },
    });
    if (!discussion) throw new NotFoundException("Discussion not found");
    if (discussion.userId !== userId)
      throw new ForbiddenException("Unauthorized");
    return await this.prisma.discussion.update({ where: { id }, data });
  }

  async deleteDiscussion(id: string, userId: string) {
    const discussion = await this.prisma.discussion.findUnique({
      where: { id },
    });
    if (!discussion) throw new NotFoundException("Discussion not found");
    if (discussion.userId !== userId)
      throw new ForbiddenException("Unauthorized");
    return await this.prisma.discussion.delete({ where: { id } });
  }

  // --- Reply ---
  async addReply(
    discussionId: string,
    userId: string,
    data: { body: string; parentReplyId?: string },
  ) {
    return await this.prisma.discussionReply.create({
      data: { ...data, discussionId, userId },
    });
  }

  async updateReply(id: string, userId: string, body: string) {
    const reply = await this.prisma.discussionReply.findUnique({
      where: { id },
    });
    if (!reply) throw new NotFoundException("Reply not found");
    if (reply.userId !== userId) throw new ForbiddenException("Unauthorized");
    return await this.prisma.discussionReply.update({
      where: { id },
      data: { body },
    });
  }

  async deleteReply(id: string, userId: string) {
    const reply = await this.prisma.discussionReply.findUnique({
      where: { id },
    });
    if (!reply) throw new NotFoundException("Reply not found");
    if (reply.userId !== userId) throw new ForbiddenException("Unauthorized");
    return await this.prisma.discussionReply.delete({ where: { id } });
  }
}
