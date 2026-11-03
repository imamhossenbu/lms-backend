import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { AuthUser } from "../../common/auth-user";
import { PrismaService } from "../../prisma/prisma.service";
import { reportEffects } from "../community-rules";
import type { CommunityThread, ThreadBundle, ThreadReply } from "../community.types";
import type { AcceptReplyDto, CreateReplyDto, ReplyBodyDto } from "../dto/reply.dto";
import type { ResolveReportDto } from "../dto/report.dto";
import type { BulkFlagDto, BulkIdsDto, CreateThreadDto, ThreadFlagsDto, UpdateThreadDto } from "../dto/thread.dto";
import { CommunityQueryService } from "./community-query.service";
import { CommunityRepliesService } from "./community-replies.service";
import { CommunityThreadsService } from "./community-threads.service";

/** Write side of admin Community: threads, pin / lock / hide (single + bulk), replies, accepted answers, reports. */
@Injectable()
export class CommunityAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly query: CommunityQueryService,
    private readonly threads: CommunityThreadsService,
    private readonly replies: CommunityRepliesService,
  ) {}

  // ---------------------------------------------------------------- threads

  create(user: AuthUser, dto: CreateThreadDto): Promise<CommunityThread> {
    return this.threads.create(user, dto);
  }

  async update(user: AuthUser, id: string, dto: UpdateThreadDto): Promise<CommunityThread> {
    return this.threads.update(await this.query.mustFind(user, id), dto);
  }

  async setFlags(user: AuthUser, id: string, dto: ThreadFlagsDto): Promise<CommunityThread> {
    await this.query.mustFind(user, id);
    if (dto.isPinned === undefined && dto.isLocked === undefined && dto.isHidden === undefined) throw new BadRequestException("Nothing to change.");
    await this.prisma.discussion.update({ where: { id }, data: { isPinned: dto.isPinned, isLocked: dto.isLocked, isHidden: dto.isHidden } });
    return this.query.thread(id);
  }

  /** Only threads of this workspace that don't already have the value are touched. */
  async bulkFlag(user: AuthUser, dto: BulkFlagDto): Promise<{ updated: number }> {
    const { count } = await this.prisma.discussion.updateMany({
      where: { ...this.query.scope(user), id: { in: dto.ids }, [dto.flag]: !dto.value },
      data: { [dto.flag]: dto.value },
    });
    return { updated: count };
  }

  async remove(user: AuthUser, id: string): Promise<{ id: string }> {
    await this.query.mustFind(user, id);
    await this.threads.remove([id]);
    return { id };
  }

  async bulkRemove(user: AuthUser, dto: BulkIdsDto): Promise<{ deleted: number }> {
    const rows = await this.prisma.discussion.findMany({ where: { ...this.query.scope(user), id: { in: dto.ids } }, select: { id: true } });
    return { deleted: await this.threads.remove(rows.map((r) => r.id)) };
  }

  async recordView(user: AuthUser, id: string) {
    await this.query.mustFind(user, id);
    return this.threads.recordView(id);
  }

  // ---------------------------------------------------------------- replies

  async reply(user: AuthUser, threadId: string, dto: CreateReplyDto): Promise<ThreadReply> {
    return this.replies.add(user, await this.query.mustFind(user, threadId), dto, { staff: true });
  }

  async editReply(user: AuthUser, replyId: string, dto: ReplyBodyDto): Promise<ThreadReply> {
    return this.replies.edit(user, await this.query.mustFindReply(user, replyId), dto.bodyHtml);
  }

  async removeReply(user: AuthUser, replyId: string): Promise<{ ids: string[] }> {
    return { ids: await this.replies.remove(await this.query.mustFindReply(user, replyId)) };
  }

  /** Soft-remove (moderator notice instead of the body) or restore. Removing also drops the accepted mark. */
  async setReplyRemoved(user: AuthUser, replyId: string, removed: boolean): Promise<ThreadReply> {
    const reply = await this.query.mustFindReply(user, replyId);
    await this.prisma.discussionReply.update({ where: { id: replyId }, data: { isRemoved: removed, ...(removed && { isAccepted: false }) } });
    await this.replies.syncResolved(reply.discussionId);
    return this.query.reply(replyId);
  }

  async accept(user: AuthUser, threadId: string, dto: AcceptReplyDto): Promise<ThreadReply[]> {
    return this.replies.accept(await this.query.mustFind(user, threadId), dto.replyId);
  }

  // ---------------------------------------------------------------- reports

  /** Resolves every open report on the same target together, then applies the action. Returns the refreshed bundle. */
  async resolveReport(user: AuthUser, reportId: string, dto: ResolveReportDto): Promise<ThreadBundle> {
    const rep = await this.prisma.discussionReport.findFirst({ where: { id: reportId, thread: this.query.scope(user) } });
    if (!rep) throw new NotFoundException("This report no longer exists.");
    const fx = reportEffects(rep.targetType === "REPLY" ? "REPLY" : "THREAD", dto.action);
    const note = dto.note?.trim() || null;
    await this.prisma.$transaction([
      this.prisma.discussionReport.updateMany({
        where: { threadId: rep.threadId, targetId: rep.targetId, status: "OPEN" },
        data: { status: fx.status, resolutionNote: note, resolvedAt: new Date(), resolvedById: user.userId },
      }),
      ...(fx.removeReply ? [this.prisma.discussionReply.updateMany({ where: { id: rep.targetId }, data: { isRemoved: true, isAccepted: false } })] : []),
      ...(fx.hideThread ? [this.prisma.discussion.update({ where: { id: rep.threadId }, data: { isHidden: true, isLocked: true } })] : []),
    ]);
    if (fx.removeReply) await this.replies.syncResolved(rep.threadId);
    return this.query.detail(user, rep.threadId);
  }
}
