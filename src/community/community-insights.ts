import { instantToLocal } from "../common/workspace-time";
import type {
  CommunityMember,
  CommunitySort,
  CommunityStats,
  CommunityTab,
  CommunityThread,
  ModerationQueueItem,
  ReportReason,
  TabCounts,
  ThreadCategory,
  ThreadListItem,
  ThreadReply,
  ThreadReport,
  ThreadView,
  TopContributor,
  TrendingTag,
} from "./community.types";

/** Pure Community numbers — ported from the panel's lib/communityStats.ts + list utils so both sides agree. */

const DAY = 86_400_000;

export function threadViews(threads: CommunityThread[], replies: ThreadReply[], reports: ThreadReport[]): ThreadView[] {
  const byThread = new Map<string, ThreadReply[]>();
  replies.forEach((r) => byThread.set(r.threadId, [...(byThread.get(r.threadId) ?? []), r]));
  const openByThread = new Map<string, number>();
  reports.forEach((r) => r.status === "OPEN" && openByThread.set(r.threadId, (openByThread.get(r.threadId) ?? 0) + 1));
  return threads.map((t) => {
    const rs = (byThread.get(t.id) ?? []).filter((r) => !r.isRemoved).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const last = rs[rs.length - 1];
    const accepted = rs.some((r) => r.isAccepted);
    const staffReplied = rs.some((r) => r.author.role !== "STUDENT");
    const people = new Map<string, CommunityMember>([[t.author.id, t.author], ...rs.map((r) => [r.author.id, r.author] as const)]);
    return {
      thread: t,
      replyCount: rs.length,
      isResolved: t.category === "QUESTION" ? accepted : staffReplied,
      isUnanswered: t.category === "QUESTION" && rs.length === 0,
      openReports: openByThread.get(t.id) ?? 0,
      lastActivityAt: last ? (last.createdAt > t.updatedAt ? last.createdAt : t.updatedAt) : t.updatedAt,
      lastReplier: last?.author ?? null,
      participants: Array.from(people.values()),
    };
  });
}

/** Stat cards + 7-day deltas. */
export function communityStats(views: ThreadView[], replies: ThreadReply[], now: Date = new Date()): CommunityStats {
  const t = now.getTime();
  const inLast = (iso: string, days: number, offset = 0) => {
    const x = new Date(iso).getTime();
    return x > t - (days + offset) * DAY && x <= t - offset * DAY;
  };
  const active = (offset: number) => views.filter((v) => inLast(v.lastActivityAt, 7, offset)).length;
  const repliesIn = (offset: number) => replies.filter((r) => !r.isRemoved && inLast(r.createdAt, 7, offset)).length;
  const delta = (a: number, b: number) => (b ? Math.round(((a - b) / b) * 100) : null);
  const questions = views.filter((v) => v.thread.category === "QUESTION");
  return {
    total: views.length,
    activeThisWeek: active(0),
    activeDelta: delta(active(0), active(7)),
    repliesThisWeek: repliesIn(0),
    repliesDelta: delta(repliesIn(0), repliesIn(7)),
    unanswered: views.filter((v) => v.isUnanswered).length,
    flagged: views.filter((v) => v.openReports > 0).length,
    openReports: views.reduce((s, v) => s + v.openReports, 0),
    answerRate: questions.length ? Math.round((questions.filter((v) => v.isResolved).length / questions.length) * 100) : 0,
  };
}

/** Median hours from question to first staff reply; null when none. */
export function medianResponseHours(views: ThreadView[], replies: ThreadReply[]): number | null {
  const hours = views
    .filter((v) => v.thread.category === "QUESTION")
    .map((v) => {
      const first = replies
        .filter((r) => r.threadId === v.thread.id && r.author.role !== "STUDENT" && !r.isRemoved)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
      return first ? (new Date(first.createdAt).getTime() - new Date(v.thread.createdAt).getTime()) / 3_600_000 : null;
    })
    .filter((h): h is number => h !== null)
    .sort((a, b) => a - b);
  if (!hours.length) return null;
  const mid = Math.floor(hours.length / 2);
  return Math.round((hours.length % 2 ? hours[mid] : (hours[mid - 1] + hours[mid]) / 2) * 10) / 10;
}

export function topContributors(replies: ThreadReply[], n = 5): TopContributor[] {
  const map = new Map<string, TopContributor>();
  replies
    .filter((r) => !r.isRemoved)
    .forEach((r) => {
      const cur = map.get(r.author.id) ?? { member: r.author, replies: 0, accepted: 0, likes: 0 };
      cur.replies += 1;
      cur.accepted += r.isAccepted ? 1 : 0;
      cur.likes += r.likes;
      map.set(r.author.id, cur);
    });
  const score = (c: TopContributor) => c.accepted * 5 + c.replies + c.likes / 5;
  return Array.from(map.values())
    .sort((a, b) => score(b) - score(a))
    .slice(0, n);
}

export function trendingTags(views: ThreadView[], n = 10, now: Date = new Date()): TrendingTag[] {
  const counts = new Map<string, number>();
  views
    .filter((v) => new Date(v.lastActivityAt).getTime() > now.getTime() - 30 * DAY)
    .forEach((v) => v.thread.tags.forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1 + v.replyCount / 5)));
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([tag, score]) => ({ tag, score: Math.round(score * 10) / 10 }));
}

export const categoryCounts = (views: ThreadView[]) =>
  views.reduce<Record<ThreadCategory, number>>((acc, v) => ((acc[v.thread.category] += 1), acc), { QUESTION: 0, DISCUSSION: 0, ANNOUNCEMENT: 0, SHOWCASE: 0, FEEDBACK: 0 });

/** Open reports grouped by thread, most reports first (Moderation Queue card). */
export function moderationQueue(views: ThreadListItem[], reports: ThreadReport[]): ModerationQueueItem[] {
  const byId = new Map(views.map((v) => [v.thread.id, v]));
  const groups = new Map<string, ThreadReport[]>();
  reports.filter((r) => r.status === "OPEN" && byId.has(r.threadId)).forEach((r) => groups.set(r.threadId, [...(groups.get(r.threadId) ?? []), r]));
  return Array.from(groups.entries())
    .map(([id, list]) => {
      const reasons = new Map<ReportReason, number>();
      list.forEach((r) => reasons.set(r.reason, (reasons.get(r.reason) ?? 0) + 1));
      const sorted = Array.from(reasons.entries()).sort((a, b) => b[1] - a[1]);
      return {
        view: byId.get(id)!,
        count: list.length,
        reporters: new Set(list.map((r) => r.reporter.id)).size,
        topReason: sorted[0][0],
        otherReasons: sorted.length - 1,
        latest: list.reduce((m, r) => (r.createdAt > m ? r.createdAt : m), list[0].createdAt),
      };
    })
    .sort((a, b) => b.count - a.count || b.latest.localeCompare(a.latest));
}

// ---------------------------------------------------------------- list: filters, tabs, sort

const TAB_MATCH: Record<CommunityTab, (v: ThreadView) => boolean> = {
  all: () => true,
  unanswered: (v) => v.isUnanswered,
  moderation: (v) => v.openReports > 0,
  pinned: (v) => v.thread.isPinned,
  resolved: (v) => v.isResolved,
  hidden: (v) => v.thread.isHidden,
};

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };
/** Rich-text HTML → one line of plain text. */
export const plainText = (html: string) =>
  html
    .replace(/<[^>]*>/g, " ")
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m] ?? m)
    .replace(/\s+/g, " ")
    .trim();

export interface ListFilters {
  q?: string;
  /** "YYYY-MM-DD" (workspace day) range on last activity. */
  from?: string;
  to?: string;
}

/** Search (title / body / author / tags / course title) + last-activity range. Course and category are filtered in the DB. */
export function applyFilters<T extends ThreadListItem>(views: T[], f: ListFilters): T[] {
  const q = (f.q ?? "").toLowerCase().trim().replace(/^#/, "");
  return views.filter((v) => {
    if (f.from || f.to) {
      const day = instantToLocal(new Date(v.lastActivityAt)).date;
      if ((f.from && day < f.from) || (f.to && day > f.to)) return false;
    }
    if (!q) return true;
    const t = v.thread;
    return [t.title, plainText(t.bodyHtml), t.author.name, v.courseTitle, ...t.tags].some((s) => s.toLowerCase().includes(q));
  });
}

export const tabCounts = (views: ThreadView[], tabs: readonly CommunityTab[]): Partial<TabCounts> =>
  tabs.reduce<Partial<TabCounts>>((acc, t) => ((acc[t] = views.filter(TAB_MATCH[t]).length), acc), {});

const SORTERS: Record<CommunitySort, (a: ThreadView, b: ThreadView) => number> = {
  activity: (a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt),
  newest: (a, b) => b.thread.createdAt.localeCompare(a.thread.createdAt),
  replies: (a, b) => b.replyCount - a.replyCount || b.lastActivityAt.localeCompare(a.lastActivityAt),
  views: (a, b) => b.thread.views - a.thread.views || b.lastActivityAt.localeCompare(a.lastActivityAt),
};

/** Tab filter + sort; pinned threads float to the top within the chosen sort. */
export const tabAndSort = <T extends ThreadView>(views: T[], tab: CommunityTab, sort: CommunitySort): T[] =>
  views.filter(TAB_MATCH[tab]).sort((a, b) => Number(b.thread.isPinned) - Number(a.thread.isPinned) || SORTERS[sort](a, b) || a.thread.id.localeCompare(b.thread.id));

// ---------------------------------------------------------------- similar discussions

const STOP_WORDS = new Set(
  "a an and are as at be but by can do does for from how i in is it my of on or the this to was what when where which why with you your vs not no get use using".split(" "),
);

export const titleTokens = (title: string) =>
  new Set(
    title
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w)),
  );

/** Duplicate check for the form: up to `limit` threads in the course whose titles share the most words. */
export function findSimilarThreads(threads: CommunityThread[], title: string, courseId: string, excludeId?: string, limit = 3): CommunityThread[] {
  const tokens = titleTokens(title);
  if (!courseId || tokens.size === 0) return [];
  return threads
    .filter((t) => t.courseId === courseId && t.id !== excludeId)
    .map((t) => {
      let score = 0;
      titleTokens(t.title).forEach((w) => tokens.has(w) && score++);
      return { t, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.t.createdAt.localeCompare(a.t.createdAt))
    .slice(0, limit)
    .map((x) => x.t);
}

/** Thread page sidebar: same course, ranked by shared tags then recent activity. */
export function relatedThreads<T extends ThreadView>(thread: CommunityThread, views: T[], limit = 4): (T & { sharedTags: number })[] {
  const tags = new Set(thread.tags);
  return views
    .filter((v) => v.thread.id !== thread.id && v.thread.courseId === thread.courseId)
    .map((v) => ({ ...v, sharedTags: v.thread.tags.filter((t) => tags.has(t)).length }))
    .sort((a, b) => b.sharedTags - a.sharedTags || b.lastActivityAt.localeCompare(a.lastActivityAt))
    .slice(0, limit);
}
