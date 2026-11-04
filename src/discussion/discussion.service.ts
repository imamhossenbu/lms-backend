import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Discussion } from "../../generated/prisma";
import type { AuthUser } from "../common/auth-user";
import { studentCategoryProblem } from "../community/community-rules";
import { STUDENT_ROLE, STUDENT_TABS } from "../community/community.constants";
import { forStudentReply, forStudentThread } from "../community/community.mapper";
import type { CommunityThread, ThreadReply, ThreadReport } from "../community/community.types";
import type { AcceptReplyDto, CreateReplyDto, ReplyBodyDto } from "../community/dto/reply.dto";
import type { CreateReportDto } from "../community/dto/report.dto";
import type { StudentThreadDto, StudentThreadQueryDto, UpdateStudentThreadDto } from "../community/dto/thread.dto";
import { CommunityQueryService, type ThreadListPage } from "../community/services/community-query.service";
import { CommunityRepliesService } from "../community/services/community-replies.service";
import { CommunityThreadsService } from "../community/services/community-threads.service";
import { PrismaService } from "../prisma/prisma.service";
import { findCourseInTenant, tenantOf } from "../common/tenancy";

/**
 * Course discussions as a member sees them: enrolled students (and the course's instructor / admins) read, post,
 * reply, edit or delete their own posts and report content. Hidden threads and report data stay with moderators.
 */
@Injectable()
export class DiscussionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly query: CommunityQueryService,
    private readonly threads: CommunityThreadsService,
    private readonly replies: CommunityRepliesService,
  ) {}

  private isStaff = (user: AuthUser) => user.role !== STUDENT_ROLE;

  /** Admins, the course's instructor, or an enrolled student. */
  private async assertMember(user: AuthUser, courseId: string) {
    // The course must be in the caller's workspace (admins included).
    const course = await findCourseInTenant(this.prisma, tenantOf(user), courseId, { instructorId: true });
    if (user.role === "ADMIN") return;
    const enrolled = await this.prisma.enrollment.findUnique({ where: { userId_courseId: { userId: user.userId, courseId } }, select: { id: true } });
    if (!enrolled && course.instructorId !== user.userId) throw new ForbiddenException("Enroll in this course to join its discussions.");
  }

  /** Visible thread of the user's workspace in a course they belong to. */
  private async mustFindVisible(user: AuthUser, id: string): Promise<Discussion> {
    const row = await this.prisma.discussion.findFirst({ where: { id, ...this.query.scope(user), ...(!this.isStaff(user) && { isHidden: false }) } });
    if (!row) throw new NotFoundException("Discussion not found");
    await this.assertMember(user, row.courseId);
    return row;
  }

  private async mustFindReply(user: AuthUser, replyId: string) {
    const reply = await this.query.mustFindReply(user, replyId);
    await this.mustFindVisible(user, reply.discussionId);
    return reply;
  }

  private assertOwner(ownerId: string, user: AuthUser, what: "discussions" | "replies") {
    if (ownerId !== user.userId) throw new ForbiddenException(`You can only change your own ${what}.`);
  }

  // ---------------------------------------------------------------- threads

  async list(user: AuthUser, courseId: string, q: StudentThreadQueryDto): Promise<ThreadListPage> {
    await this.assertMember(user, courseId);
    const d = await this.query.load(
      { ...this.query.scope(user), courseId, isHidden: false, ...(q.category && { category: q.category }) },
      { reports: false },
    );
    const page = this.query.page(this.query.listItems(d), q, STUDENT_TABS);
    return {
      ...page,
      data: page.data.map((v) => ({
        ...v,
        thread: forStudentThread(v.thread),
        lastReplier: v.lastReplier && { ...v.lastReplier, email: "" },
        participants: v.participants.map((p) => ({ ...p, email: "" })),
      })),
    };
  }

  /** Thread + replies (removed replies without their body). Counts a view. */
  async detail(user: AuthUser, id: string): Promise<{ thread: CommunityThread; replies: ThreadReply[] }> {
    await this.mustFindVisible(user, id);
    await this.threads.recordView(id);
    const d = await this.query.load({ id }, { reports: false });
    return { thread: forStudentThread(d.threads[0]), replies: d.replies.map(forStudentReply) };
  }

  async create(user: AuthUser, dto: StudentThreadDto): Promise<CommunityThread> {
    if (!this.isStaff(user)) {
      const problem = studentCategoryProblem(dto.category);
      if (problem) throw new BadRequestException([problem]);
    }
    await this.assertMember(user, dto.courseId);
    return forStudentThread(await this.threads.create(user, dto));
  }

  async update(user: AuthUser, id: string, dto: UpdateStudentThreadDto): Promise<CommunityThread> {
    const row = await this.mustFindVisible(user, id);
    this.assertOwner(row.userId, user, "discussions");
    if (dto.category && !this.isStaff(user)) {
      const problem = studentCategoryProblem(dto.category);
      if (problem) throw new BadRequestException([problem]);
    }
    if (dto.courseId && dto.courseId !== row.courseId) await this.assertMember(user, dto.courseId);
    return forStudentThread(await this.threads.update(row, dto));
  }

  /** Own discussions only, and only while nobody else has replied. */
  async remove(user: AuthUser, id: string): Promise<{ id: string }> {
    const row = await this.mustFindVisible(user, id);
    this.assertOwner(row.userId, user, "discussions");
    const others = await this.prisma.discussionReply.count({ where: { discussionId: id, userId: { not: user.userId } } });
    if (others > 0) throw new BadRequestException("Others have replied to this discussion, so it can't be deleted. Ask a moderator to remove it.");
    await this.threads.remove([id]);
    return { id };
  }

  /** Thread author marks the answer of their own question. */
  async accept(user: AuthUser, id: string, dto: AcceptReplyDto): Promise<ThreadReply[]> {
    const row = await this.mustFindVisible(user, id);
    if (row.userId !== user.userId && !this.isStaff(user)) throw new ForbiddenException("Only the person who asked can accept an answer.");
    return (await this.replies.accept(row, dto.replyId)).map(forStudentReply);
  }

  // ---------------------------------------------------------------- replies

  async reply(user: AuthUser, id: string, dto: CreateReplyDto): Promise<ThreadReply> {
    const row = await this.mustFindVisible(user, id);
    return forStudentReply(await this.replies.add(user, row, dto, { staff: false }));
  }

  async editReply(user: AuthUser, replyId: string, dto: ReplyBodyDto): Promise<ThreadReply> {
    const reply = await this.mustFindReply(user, replyId);
    this.assertOwner(reply.userId, user, "replies");
    return forStudentReply(await this.replies.edit(user, reply, dto.bodyHtml));
  }

  /** Own replies only; a reply others have answered stays (a moderator can remove it). */
  async removeReply(user: AuthUser, replyId: string): Promise<{ ids: string[] }> {
    const reply = await this.mustFindReply(user, replyId);
    this.assertOwner(reply.userId, user, "replies");
    const answers = await this.prisma.discussionReply.count({ where: { parentReplyId: reply.id, userId: { not: user.userId } } });
    if (answers > 0) throw new BadRequestException("Others have answered this reply, so it can't be deleted. Ask a moderator to remove it.");
    return { ids: await this.replies.remove(reply) };
  }

  // ---------------------------------------------------------------- reports

  async report(user: AuthUser, id: string, dto: CreateReportDto): Promise<Pick<ThreadReport, "id" | "status" | "createdAt">> {
    const row = await this.mustFindVisible(user, id);
    const r = await this.replies.report(user, row, dto);
    return { id: r.id, status: r.status, createdAt: r.createdAt };
  }
}
