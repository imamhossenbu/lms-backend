import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "../../../generated/prisma";
import type { AuthUser } from "../../common/auth-user";
import { paginated, skipTake, type Paginated } from "../../common/pagination";
import { PrismaService } from "../../prisma/prisma.service";
import {
  applyFilters,
  categoryCounts,
  communityStats,
  findSimilarThreads,
  medianResponseHours,
  moderationQueue,
  relatedThreads,
  tabAndSort,
  tabCounts,
  threadViews,
  topContributors,
  trendingTags,
} from "../community-insights";
import { COMMUNITY_TABS } from "../community.constants";
import { toReply, toReport, toThread, type Members } from "../community.mapper";
import type {
  CommunityData,
  CommunityTab,
  CommunityThread,
  ModerationQueueItem,
  TabCounts,
  ThreadBundle,
  ThreadListItem,
  ThreadReply,
} from "../community.types";
import type { SimilarQueryDto, ThreadQueryDto } from "../dto/thread.dto";

export interface LoadedCommunity extends CommunityData {
  courseTitles: Map<string, string>;
}

export type ThreadListPage = Paginated<ThreadListItem> & { counts: Partial<TabCounts> };

/**
 * Read side of Community. Tabs (unanswered / resolved / needs moderation) and "last activity" are derived from replies
 * and reports exactly like the panel, so a list loads the scoped threads with their replies and reports, derives the
 * views in memory (community-insights.ts), then filters, sorts and pages them.
 */
@Injectable()
export class CommunityQueryService {
  constructor(private readonly prisma: PrismaService) {}

  scope(actor: Pick<AuthUser, "institutionId">): Prisma.DiscussionWhereInput {
    return { institutionId: actor.institutionId ?? null };
  }

  async mustFind(actor: AuthUser, id: string) {
    const row = await this.prisma.discussion.findFirst({ where: { id, ...this.scope(actor) } });
    if (!row) throw new NotFoundException("This discussion no longer exists.");
    return row;
  }

  /** Reply of a thread in the actor's workspace (404 otherwise). */
  async mustFindReply(actor: AuthUser, replyId: string) {
    const reply = await this.prisma.discussionReply.findFirst({ where: { id: replyId, discussion: this.scope(actor) } });
    if (!reply) throw new NotFoundException("This reply no longer exists.");
    return reply;
  }

  async members(ids: Iterable<string>): Promise<Members> {
    const unique = [...new Set(ids)];
    if (!unique.length) return new Map();
    const users = await this.prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, name: true, email: true, role: true } });
    return new Map(users.map((u) => [u.id, u]));
  }

  /** Threads matching `where` + their replies, reports, members and course titles, in panel shapes. */
  async load(where: Prisma.DiscussionWhereInput, opts: { reports?: boolean } = {}): Promise<LoadedCommunity> {
    const rows = await this.prisma.discussion.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "asc" }] });
    const ids = rows.map((r) => r.id);
    const [replies, reports, courses] = ids.length
      ? await Promise.all([
          this.prisma.discussionReply.findMany({ where: { discussionId: { in: ids } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
          opts.reports === false ? [] : this.prisma.discussionReport.findMany({ where: { threadId: { in: ids } }, orderBy: [{ createdAt: "desc" }, { id: "asc" }] }),
          this.prisma.course.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.courseId))] } }, select: { id: true, title: true } }),
        ])
      : [[], [], []];
    const members = await this.members([...rows.map((r) => r.userId), ...replies.map((r) => r.userId), ...reports.map((r) => r.reporterId)]);
    return {
      threads: rows.map((r) => toThread(r, members)),
      replies: replies.map((r) => toReply(r, members)),
      reports: reports.map((r) => toReport(r, members)),
      courseTitles: new Map(courses.map((c) => [c.id, c.title])),
    };
  }

  listItems(d: LoadedCommunity): ThreadListItem[] {
    return threadViews(d.threads, d.replies, d.reports).map((v) => ({ ...v, courseTitle: d.courseTitles.get(v.thread.courseId) ?? "" }));
  }

  /** Filtered, tab-counted, sorted page. `tabs` limits which tab counts are returned. */
  page(items: ThreadListItem[], q: Pick<ThreadQueryDto, "q" | "from" | "to" | "tab" | "sort" | "page" | "limit">, tabs: readonly CommunityTab[]): ThreadListPage {
    const filtered = applyFilters(items, q);
    const listed = tabAndSort(filtered, q.tab, q.sort);
    const { skip, take } = skipTake(q);
    return { ...paginated(listed.slice(skip, skip + take), listed.length, q), counts: tabCounts(filtered, tabs) };
  }

  async list(actor: AuthUser, q: ThreadQueryDto): Promise<ThreadListPage> {
    const where: Prisma.DiscussionWhereInput = { ...this.scope(actor), ...(q.courseId && { courseId: q.courseId }), ...(q.category && { category: q.category }) };
    return this.page(this.listItems(await this.load(where)), q, COMMUNITY_TABS);
  }

  /** Stat cards, health strip and sidebar cards of the Community page. */
  async stats(actor: AuthUser) {
    const d = await this.load(this.scope(actor));
    const views = threadViews(d.threads, d.replies, d.reports);
    return {
      stats: communityStats(views, d.replies),
      medianResponseHours: medianResponseHours(views, d.replies),
      topContributors: topContributors(d.replies, 5),
      trendingTags: trendingTags(views, 10),
      categoryCounts: categoryCounts(views),
    };
  }

  async moderationQueue(actor: AuthUser): Promise<ModerationQueueItem[]> {
    const d = await this.load(this.scope(actor));
    return moderationQueue(this.listItems(d), d.reports);
  }

  async detail(actor: AuthUser, id: string): Promise<ThreadBundle> {
    await this.mustFind(actor, id);
    const d = await this.load({ id });
    return { thread: d.threads[0], replies: d.replies, reports: d.reports };
  }

  /** "Similar Discussions" sidebar: same course, shared tags first. */
  async related(actor: AuthUser, id: string) {
    const row = await this.mustFind(actor, id);
    const d = await this.load({ ...this.scope(actor), courseId: row.courseId });
    const items = this.listItems(d);
    const self = items.find((v) => v.thread.id === id)!;
    return relatedThreads(self.thread, items);
  }

  /** Duplicate check for the New / Edit form (title word overlap, same course). */
  async similar(actor: AuthUser, q: SimilarQueryDto): Promise<CommunityThread[]> {
    const rows = await this.prisma.discussion.findMany({ where: { ...this.scope(actor), courseId: q.courseId } });
    const members = await this.members(rows.map((r) => r.userId));
    return findSimilarThreads(
      rows.map((r) => toThread(r, members)),
      q.title,
      q.courseId,
      q.excludeId,
    );
  }

  async thread(id: string): Promise<CommunityThread> {
    const row = await this.prisma.discussion.findUniqueOrThrow({ where: { id } });
    return toThread(row, await this.members([row.userId]));
  }

  async reply(id: string): Promise<ThreadReply> {
    const row = await this.prisma.discussionReply.findUniqueOrThrow({ where: { id } });
    return toReply(row, await this.members([row.userId]));
  }
}
