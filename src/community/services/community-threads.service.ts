import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Discussion, Prisma } from "../../../generated/prisma";
import type { AuthUser } from "../../common/auth-user";
import { sanitizeRichText } from "../../common/html";
import { PrismaService } from "../../prisma/prisma.service";
import { threadBodyProblem } from "../community-rules";
import { joinTags } from "../community.mapper";
import type { CommunityThread } from "../community.types";
import type { StudentThreadDto, UpdateThreadDto } from "../dto/thread.dto";
import { CommunityQueryService } from "./community-query.service";

/** Content columns that bump updatedAt (= panel updateThread's contentChanged keys). */
const CONTENT_KEYS = ["title", "bodyHtml", "category", "courseId", "moduleId", "tags"] as const;

/** Thread writes shared by the admin panel and the student side: create, edit content, delete, count views. */
@Injectable()
export class CommunityThreadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly query: CommunityQueryService,
  ) {}

  /** Course must exist; module (when given) must belong to it. */
  private async assertPlacement(courseId: string, moduleId: string) {
    const course = await this.prisma.course.findUnique({ where: { id: courseId }, select: { id: true } });
    if (!course) throw new NotFoundException("Select a course");
    if (moduleId) {
      const mod = await this.prisma.courseModule.findFirst({ where: { id: moduleId, courseId }, select: { id: true } });
      if (!mod) throw new BadRequestException("Select a module from this course");
    }
  }

  private cleanBody(html: string) {
    const body = sanitizeRichText(html);
    const problem = threadBodyProblem(body);
    if (problem) throw new BadRequestException([problem]);
    return body;
  }

  async create(actor: AuthUser, dto: StudentThreadDto & { isPinned?: boolean; isLocked?: boolean }): Promise<CommunityThread> {
    await this.assertPlacement(dto.courseId, dto.moduleId);
    const now = new Date();
    const row = await this.prisma.discussion.create({
      data: {
        institutionId: actor.institutionId ?? null,
        userId: actor.userId,
        courseId: dto.courseId,
        moduleId: dto.moduleId || null,
        title: dto.title.trim(),
        body: this.cleanBody(dto.bodyHtml),
        category: dto.category,
        tags: joinTags(dto.tags),
        isPinned: dto.isPinned ?? false,
        isLocked: dto.isLocked ?? false,
        createdAt: now,
        updatedAt: now,
      },
    });
    return this.query.thread(row.id);
  }

  /** Any subset of the form fields. updatedAt moves only when content changed. */
  async update(current: Discussion, dto: UpdateThreadDto): Promise<CommunityThread> {
    const courseId = dto.courseId ?? current.courseId;
    const moduleId = dto.moduleId ?? (dto.courseId && dto.courseId !== current.courseId ? "" : (current.moduleId ?? ""));
    if (dto.courseId !== undefined || dto.moduleId !== undefined) await this.assertPlacement(courseId, moduleId);
    const data: Prisma.DiscussionUpdateInput = {
      ...(dto.title !== undefined && { title: dto.title.trim() }),
      ...(dto.bodyHtml !== undefined && { body: this.cleanBody(dto.bodyHtml) }),
      ...(dto.category !== undefined && { category: dto.category }),
      ...((dto.courseId !== undefined || dto.moduleId !== undefined) && { courseId, moduleId: moduleId || null }),
      ...(dto.tags !== undefined && { tags: joinTags(dto.tags) }),
      ...(dto.isPinned !== undefined && { isPinned: dto.isPinned }),
      ...(dto.isLocked !== undefined && { isLocked: dto.isLocked }),
      ...(CONTENT_KEYS.some((k) => dto[k] !== undefined) && { updatedAt: new Date() }),
    };
    await this.prisma.discussion.update({ where: { id: current.id }, data });
    return this.query.thread(current.id);
  }

  /** Thread + replies (reports cascade). */
  async remove(ids: string[]): Promise<number> {
    if (!ids.length) return 0;
    const [, deleted] = await this.prisma.$transaction([
      this.prisma.discussionReply.deleteMany({ where: { discussionId: { in: ids } } }),
      this.prisma.discussion.deleteMany({ where: { id: { in: ids } } }),
    ]);
    return deleted.count;
  }

  async recordView(id: string): Promise<{ views: number }> {
    const row = await this.prisma.discussion.update({ where: { id }, data: { views: { increment: 1 } }, select: { views: true } });
    return { views: row.views };
  }
}
