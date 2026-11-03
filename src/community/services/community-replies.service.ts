import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Discussion, DiscussionReply } from "../../../generated/prisma";
import type { AuthUser } from "../../common/auth-user";
import { sanitizeRichText } from "../../common/html";
import { PrismaService } from "../../prisma/prisma.service";
import { acceptProblem, replyBlockedProblem, replyBodyProblem, replyIdsToDelete, reportProblem } from "../community-rules";
import { categoryOf, toReport } from "../community.mapper";
import type { ThreadReply, ThreadReport } from "../community.types";
import type { CreateReplyDto } from "../dto/reply.dto";
import type { CreateReportDto } from "../dto/report.dto";
import { CommunityQueryService } from "./community-query.service";

/** Reply + report writes shared by the admin panel and the student side. */
@Injectable()
export class CommunityRepliesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly query: CommunityQueryService,
  ) {}

  private cleanBody(html: string) {
    const body = sanitizeRichText(html);
    const problem = replyBodyProblem(body);
    if (problem) throw new BadRequestException([problem]);
    return body;
  }

  /** Keeps the legacy `isResolved` column equal to "has a visible accepted answer". */
  async syncResolved(threadId: string) {
    const accepted = await this.prisma.discussionReply.count({ where: { discussionId: threadId, isAccepted: true, isRemoved: false } });
    await this.prisma.discussion.update({ where: { id: threadId }, data: { isResolved: accepted > 0 } });
  }

  /** New reply (one level of nesting); the thread's activity time moves. */
  async add(actor: AuthUser, thread: Discussion, dto: CreateReplyDto, opts: { staff: boolean }): Promise<ThreadReply> {
    const blocked = replyBlockedProblem(thread, opts.staff);
    if (blocked) throw new BadRequestException(blocked);
    let parent: Pick<DiscussionReply, "id" | "parentReplyId"> | null = null;
    if (dto.parentId) {
      parent = await this.prisma.discussionReply.findFirst({ where: { id: dto.parentId, discussionId: thread.id }, select: { id: true, parentReplyId: true } });
      if (!parent) throw new NotFoundException("The reply you're answering no longer exists.");
    }
    const body = this.cleanBody(dto.bodyHtml);
    const now = new Date();
    const [reply] = await this.prisma.$transaction([
      this.prisma.discussionReply.create({
        data: { discussionId: thread.id, userId: actor.userId, body, parentReplyId: parent ? (parent.parentReplyId ?? parent.id) : null, createdAt: now, updatedAt: now },
      }),
      this.prisma.discussion.update({ where: { id: thread.id }, data: { updatedAt: now } }),
    ]);
    return this.query.reply(reply.id);
  }

  /** Authors edit their own replies only; removed replies stay frozen. */
  async edit(actor: AuthUser, reply: DiscussionReply, bodyHtml: string): Promise<ThreadReply> {
    if (reply.userId !== actor.userId) throw new ForbiddenException("You can only edit your own replies.");
    if (reply.isRemoved) throw new BadRequestException("A removed reply can't be edited.");
    await this.prisma.discussionReply.update({ where: { id: reply.id }, data: { body: this.cleanBody(bodyHtml), updatedAt: new Date() } });
    return this.query.reply(reply.id);
  }

  /** Deletes the reply, its nested replies and reports on any of them. Returns the deleted ids. */
  async remove(reply: DiscussionReply): Promise<string[]> {
    const siblings = await this.prisma.discussionReply.findMany({ where: { discussionId: reply.discussionId }, select: { id: true, parentReplyId: true } });
    const ids = replyIdsToDelete(reply.id, siblings);
    await this.prisma.$transaction([
      this.prisma.discussionReport.deleteMany({ where: { threadId: reply.discussionId, targetId: { in: ids } } }),
      this.prisma.discussionReply.deleteMany({ where: { id: { in: ids } } }),
    ]);
    await this.syncResolved(reply.discussionId);
    return ids;
  }

  /** Accept one top-level reply as the answer (null clears it). At most one per thread. */
  async accept(thread: Discussion, replyId: string | null): Promise<ThreadReply[]> {
    const reply = replyId ? await this.prisma.discussionReply.findUnique({ where: { id: replyId } }) : null;
    if (replyId && !reply) throw new NotFoundException("This reply no longer exists.");
    const problem = acceptProblem({ id: thread.id, category: categoryOf(thread.category) }, reply);
    if (problem) throw new BadRequestException(problem);
    await this.prisma.$transaction([
      this.prisma.discussionReply.updateMany({ where: { discussionId: thread.id, isAccepted: true }, data: { isAccepted: false } }),
      ...(replyId ? [this.prisma.discussionReply.update({ where: { id: replyId }, data: { isAccepted: true } })] : []),
      this.prisma.discussion.update({ where: { id: thread.id }, data: { isResolved: !!replyId } }),
    ]);
    return (await this.query.load({ id: thread.id }, { reports: false })).replies;
  }

  /** A member reports the thread or one of its replies. */
  async report(actor: AuthUser, thread: Discussion, dto: CreateReportDto): Promise<ThreadReport> {
    let target = { type: "THREAD" as "THREAD" | "REPLY", id: thread.id, authorId: thread.userId };
    if (dto.replyId) {
      const reply = await this.prisma.discussionReply.findFirst({ where: { id: dto.replyId, discussionId: thread.id, isRemoved: false } });
      if (!reply) throw new NotFoundException("This reply no longer exists.");
      target = { type: "REPLY", id: reply.id, authorId: reply.userId };
    }
    const existing = await this.prisma.discussionReport.count({ where: { targetId: target.id, reporterId: actor.userId, status: "OPEN" } });
    const problem = reportProblem({ reporterId: actor.userId, authorId: target.authorId, alreadyReported: existing > 0 });
    if (problem) throw new BadRequestException(problem);
    const row = await this.prisma.discussionReport.create({
      data: {
        institutionId: thread.institutionId,
        threadId: thread.id,
        targetType: target.type,
        targetId: target.id,
        reporterId: actor.userId,
        reason: dto.reason,
        note: dto.note ?? "",
      },
    });
    return toReport(row, await this.query.members([actor.userId]));
  }
}
