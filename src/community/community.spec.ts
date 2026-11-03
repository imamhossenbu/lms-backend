import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
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
} from "./community-insights";
import { acceptProblem, replyBlockedProblem, replyBodyProblem, replyIdsToDelete, replyParentId, reportEffects, reportProblem, studentCategoryProblem, threadBodyProblem } from "./community-rules";
import { COMMUNITY_TABS } from "./community.constants";
import { bodyHtmlOf, communityRole, joinTags, tagsOf, toMember, toReply, toThread } from "./community.mapper";
import type { CommunityMember, CommunityThread, ThreadListItem, ThreadReply, ThreadReport } from "./community.types";
import { AcceptReplyDto, CreateReplyDto } from "./dto/reply.dto";
import { ResolveReportDto } from "./dto/report.dto";
import { CreateThreadDto, StudentThreadQueryDto } from "./dto/thread.dto";

const messages = (cls: any, body: object) =>
  validateSync(plainToInstance(cls, body), { whitelist: true }).flatMap(function flat(e): string[] {
    return [...Object.values(e.constraints ?? {}), ...(e.children ?? []).flatMap(flat)];
  });

const NOW = new Date("2027-03-15T12:00:00Z");
const ago = (days: number, hours = 0) => new Date(NOW.getTime() - days * 86_400_000 - hours * 3_600_000).toISOString();
const COURSE = "11111111-1111-4111-8111-111111111111";

const student: CommunityMember = { id: "s1", name: "Sara Student", email: "s@x.io", role: "STUDENT" };
const student2: CommunityMember = { id: "s2", name: "Omar", email: "o@x.io", role: "STUDENT" };
const teacher: CommunityMember = { id: "t1", name: "Tina Teacher", email: "t@x.io", role: "INSTRUCTOR" };

const thread = (over: Partial<CommunityThread> = {}): CommunityThread => ({
  id: "th1",
  title: "How do React hooks work?",
  bodyHtml: "<p>I am confused about useEffect cleanup.</p>",
  category: "QUESTION",
  courseId: COURSE,
  moduleId: "",
  tags: ["react", "hooks"],
  author: student,
  isPinned: false,
  isLocked: false,
  isHidden: false,
  views: 0,
  likes: 0,
  createdAt: ago(10),
  updatedAt: ago(10),
  ...over,
});
const reply = (over: Partial<ThreadReply> = {}): ThreadReply => ({
  id: "r1",
  threadId: "th1",
  parentId: null,
  author: teacher,
  bodyHtml: "<p>Return a function.</p>",
  likes: 0,
  isAccepted: false,
  isRemoved: false,
  createdAt: ago(9),
  updatedAt: ago(9),
  ...over,
});
const report = (over: Partial<ThreadReport> = {}): ThreadReport => ({
  id: "rep1",
  targetId: "th1",
  targetType: "THREAD",
  threadId: "th1",
  reporter: student2,
  reason: "SPAM",
  note: "",
  status: "OPEN",
  createdAt: ago(1),
  ...over,
});
const items = (views: ReturnType<typeof threadViews>): ThreadListItem[] => views.map((v) => ({ ...v, courseTitle: "React Basics" }));

describe("threadViews", () => {
  it("derives replies, resolved, unanswered, open reports, last activity and participants", () => {
    const [q, d] = threadViews(
      [thread(), thread({ id: "th2", category: "DISCUSSION", title: "Show your project" })],
      [reply({ isAccepted: true }), reply({ id: "r2", author: student2, createdAt: ago(2) }), reply({ id: "r3", isRemoved: true, createdAt: ago(0, 1) })],
      [report(), report({ id: "rep2", status: "DISMISSED" })],
    );
    expect(q).toMatchObject({ replyCount: 2, isResolved: true, isUnanswered: false, openReports: 1, lastActivityAt: ago(2), lastReplier: student2 });
    expect(q.participants.map((p) => p.id)).toEqual(["s1", "t1", "s2"]);
    expect(d).toMatchObject({ replyCount: 0, isResolved: false, isUnanswered: false, lastActivityAt: ago(10), lastReplier: null });
  });

  it("non-questions are resolved by any staff reply; questions with no reply are unanswered", () => {
    const [d] = threadViews([thread({ category: "DISCUSSION" })], [reply()], []);
    expect(d.isResolved).toBe(true);
    expect(threadViews([thread()], [], [])[0].isUnanswered).toBe(true);
  });
});

describe("stats", () => {
  const threads = [
    thread({ id: "A", updatedAt: ago(10) }),
    thread({ id: "B", category: "DISCUSSION", tags: ["css"], createdAt: ago(12), updatedAt: ago(8) }),
    thread({ id: "C", tags: ["react"], createdAt: ago(3), updatedAt: ago(3) }),
  ];
  const replies = [reply({ id: "r1", threadId: "A", isAccepted: true, likes: 5, createdAt: ago(1) }), reply({ id: "r2", threadId: "A", author: student2, createdAt: ago(9) })];
  const views = threadViews(threads, replies, [report({ threadId: "A", targetId: "A" })]);

  it("computes the cards and 7-day deltas like the panel", () => {
    expect(communityStats(views, replies, NOW)).toEqual({
      total: 3,
      activeThisWeek: 2,
      activeDelta: 100,
      repliesThisWeek: 1,
      repliesDelta: 0,
      unanswered: 1,
      flagged: 1,
      openReports: 1,
      answerRate: 50,
    });
  });

  it("median staff response, top contributors, trending tags, categories", () => {
    expect(medianResponseHours(views, replies)).toBe(216);
    expect(topContributors(replies).map((c) => [c.member.id, c.replies, c.accepted, c.likes])).toEqual([
      ["t1", 1, 1, 5],
      ["s2", 1, 0, 0],
    ]);
    expect(trendingTags(views, 10, NOW)).toEqual([
      { tag: "react", score: 2.4 },
      { tag: "hooks", score: 1.4 },
      { tag: "css", score: 1 },
    ]);
    expect(categoryCounts(views)).toEqual({ QUESTION: 2, DISCUSSION: 1, ANNOUNCEMENT: 0, SHOWCASE: 0, FEEDBACK: 0 });
    expect(medianResponseHours(threadViews([thread()], [], []), [])).toBeNull();
  });

  it("groups open reports into the moderation queue", () => {
    const reps = [report({ threadId: "A", targetId: "A" }), report({ id: "x", threadId: "A", targetId: "r2", targetType: "REPLY", reason: "ABUSIVE", reporter: teacher, createdAt: ago(0, 2) }), report({ id: "y", threadId: "A", reason: "SPAM", status: "DISMISSED" })];
    const queue = moderationQueue(items(threadViews(threads, replies, reps)), reps);
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ count: 2, reporters: 2, otherReasons: 1, latest: ago(0, 2) });
  });
});

describe("list filters, tabs and sort", () => {
  const list = items(
    threadViews(
      [
        thread({ id: "A", title: "useMemo trick", updatedAt: ago(1) }),
        thread({ id: "B", category: "DISCUSSION", title: "Grid vs flex", tags: ["css"], isPinned: true, updatedAt: ago(5), views: 3 }),
        thread({ id: "C", title: "Hidden one", isHidden: true, updatedAt: ago(2), views: 9 }),
      ],
      [reply({ threadId: "A", isAccepted: true, createdAt: ago(1) })],
      [report({ threadId: "C", targetId: "C" })],
    ),
  );

  it("searches title, body, author, course title and tags (leading # ignored)", () => {
    expect(applyFilters(list, { q: "#css" }).map((v) => v.thread.id)).toEqual(["B"]);
    expect(applyFilters(list, { q: "sara" })).toHaveLength(3);
    expect(applyFilters(list, { q: "react basics" })).toHaveLength(3);
    expect(applyFilters(list, { q: "usememo" }).map((v) => v.thread.id)).toEqual(["A"]);
  });

  it("filters on the workspace day of last activity", () => {
    const day = (iso: string) => new Date(new Date(iso).getTime() + 6 * 3_600_000).toISOString().slice(0, 10);
    expect(applyFilters(list, { from: day(ago(2)) }).map((v) => v.thread.id).sort()).toEqual(["A", "C"]);
    expect(applyFilters(list, { to: day(ago(5)) }).map((v) => v.thread.id)).toEqual(["B"]);
  });

  it("counts tabs and floats pinned threads to the top of every sort", () => {
    expect(tabCounts(list, COMMUNITY_TABS)).toEqual({ all: 3, unanswered: 1, moderation: 1, pinned: 1, resolved: 1, hidden: 1 });
    expect(tabAndSort(list, "all", "activity").map((v) => v.thread.id)).toEqual(["B", "A", "C"]);
    expect(tabAndSort(list, "all", "views").map((v) => v.thread.id)).toEqual(["B", "C", "A"]);
    expect(tabAndSort(list, "moderation", "activity").map((v) => v.thread.id)).toEqual(["C"]);
  });

  it("finds similar titles in the same course and related threads by shared tags", () => {
    const threads = [thread({ id: "A", title: "React hooks cleanup question" }), thread({ id: "B", title: "Grid layout" }), thread({ id: "C", title: "Hooks in react", courseId: "other" })];
    expect(findSimilarThreads(threads, "How does the react hooks cleanup work", COURSE).map((t) => t.id)).toEqual(["A"]);
    expect(findSimilarThreads(threads, "the and", COURSE)).toEqual([]);
    const rel = relatedThreads(list[0].thread, list);
    expect(rel.map((r) => [r.thread.id, r.sharedTags])).toEqual([
      ["C", 2],
      ["B", 0],
    ]);
  });
});

describe("rules", () => {
  it("re-checks body length after sanitizing", () => {
    expect(threadBodyProblem("<p>short</p>")).toBe("Write at least 20 characters");
    expect(threadBodyProblem(`<p>${"a".repeat(5001)}</p>`)).toBe("Keep it under 5000 characters");
    expect(threadBodyProblem("<p>This is plenty of characters.</p>")).toBeNull();
    expect(replyBodyProblem("<p> </p>")).toBe("Write a reply");
    expect(replyBodyProblem("<p>ok</p>")).toBeNull();
  });

  it("nesting, locking, announcements, accepting, deleting", () => {
    expect(replyParentId(null)).toBeNull();
    expect(replyParentId({ id: "r1", parentReplyId: null })).toBe("r1");
    expect(replyParentId({ id: "r2", parentReplyId: "r1" })).toBe("r1");
    expect(replyBlockedProblem({ isLocked: true }, true)).toBe("This discussion is locked. Unlock it to reply.");
    expect(replyBlockedProblem({ isLocked: true }, false)).toBe("This discussion is locked. No new replies can be posted.");
    expect(replyBlockedProblem({ isLocked: false }, false)).toBeNull();
    expect(studentCategoryProblem("ANNOUNCEMENT")).toBe("Only instructors and admins can post announcements");
    expect(studentCategoryProblem("QUESTION")).toBeNull();
    const q = { id: "t", category: "QUESTION" as const };
    expect(acceptProblem({ ...q, category: "DISCUSSION" }, null)).toBe("Only questions can have an accepted answer.");
    expect(acceptProblem(q, null)).toBeNull();
    expect(acceptProblem(q, { discussionId: "t", parentReplyId: "p", isRemoved: false })).toBe("Only top-level replies can be accepted as the answer.");
    expect(acceptProblem(q, { discussionId: "t", parentReplyId: null, isRemoved: true })).toBe("A removed reply can't be accepted as the answer.");
    expect(acceptProblem(q, { discussionId: "x", parentReplyId: null, isRemoved: false })).toBe("This reply belongs to another discussion.");
    expect(replyIdsToDelete("r1", [{ id: "r1", parentReplyId: null }, { id: "r2", parentReplyId: "r1" }, { id: "r3", parentReplyId: null }])).toEqual(["r1", "r2"]);
  });

  it("report resolution effects and report guards", () => {
    expect(reportEffects("REPLY", "DISMISS")).toEqual({ status: "DISMISSED", removeReply: false, hideThread: false });
    expect(reportEffects("REPLY", "REMOVE_CONTENT")).toEqual({ status: "ACTIONED", removeReply: true, hideThread: false });
    expect(reportEffects("THREAD", "REMOVE_CONTENT")).toEqual({ status: "ACTIONED", removeReply: false, hideThread: true });
    expect(reportEffects("REPLY", "HIDE_THREAD")).toEqual({ status: "ACTIONED", removeReply: false, hideThread: true });
    expect(reportProblem({ reporterId: "a", authorId: "a", alreadyReported: false })).toBe("You can't report your own post.");
    expect(reportProblem({ reporterId: "a", authorId: "b", alreadyReported: true })).toBe("You've already reported this. A moderator will review it.");
    expect(reportProblem({ reporterId: "a", authorId: "b", alreadyReported: false })).toBeNull();
  });
});

describe("mapper", () => {
  const members = new Map([["u1", { id: "u1", name: "Ann", email: "a@x.io", role: "TEACHER" }]]);

  it("maps roles and missing users defensively", () => {
    expect(communityRole("STUDENT")).toBe("STUDENT");
    expect(communityRole("TEACHER")).toBe("INSTRUCTOR");
    expect(communityRole("ADMIN")).toBe("ADMIN");
    expect(toMember("u1", members)).toEqual({ id: "u1", name: "Ann", email: "a@x.io", role: "INSTRUCTOR" });
    expect(toMember("gone", members)).toEqual({ id: "gone", name: "Deleted user", email: "", role: "STUDENT" });
  });

  it("tags and legacy plain-text bodies", () => {
    expect(tagsOf(" React, hooks,,react ")).toEqual(["react", "hooks"]);
    expect(tagsOf(null)).toEqual([]);
    expect(joinTags(["a1", "A1", "b-2"])).toBe("a1,b-2");
    expect(joinTags([])).toBeNull();
    expect(bodyHtmlOf("1 < 2 & done")).toBe("<p>1 &lt; 2 &amp; done</p>");
    expect(bodyHtmlOf("<p>x</p>")).toBe("<p>x</p>");
  });

  it("maps a legacy thread and reply (no flags, no updatedAt)", () => {
    const created = new Date("2026-01-01T00:00:00Z");
    const t = toThread(
      { id: "d", institutionId: null, courseId: COURSE, moduleId: null, userId: "u1", title: "Old", body: "plain", tags: "a,b", category: "WHATEVER", isResolved: false, isPinned: false, isLocked: false, isHidden: false, views: 0, likes: 0, createdAt: created, updatedAt: null },
      members,
    );
    expect(t).toMatchObject({ moduleId: "", tags: ["a", "b"], category: "DISCUSSION", bodyHtml: "<p>plain</p>", updatedAt: created.toISOString() });
    const r = toReply({ id: "r", discussionId: "d", userId: "zz", body: "hi", parentReplyId: null, likes: 0, isAccepted: false, isRemoved: false, createdAt: created, updatedAt: null }, members);
    expect(r).toMatchObject({ threadId: "d", parentId: null, updatedAt: created.toISOString(), author: { name: "Deleted user" } });
  });
});

describe("DTO messages (copied from the panel)", () => {
  const valid = { title: "How do hooks work?", category: "QUESTION", courseId: COURSE, moduleId: "", bodyHtml: "<p>Twenty characters at least here.</p>", tags: ["react"], isPinned: false, isLocked: false };

  it("accepts a valid thread and normalizes tags", () => {
    expect(messages(CreateThreadDto, valid)).toEqual([]);
    expect(plainToInstance(CreateThreadDto, { ...valid, tags: [" React ", "react"] }).tags).toEqual(["react"]);
  });

  it("thread form messages", () => {
    expect(messages(CreateThreadDto, { ...valid, title: "  short  " })).toContain("Title must be at least 8 characters");
    expect(messages(CreateThreadDto, { ...valid, title: "x".repeat(151) })).toContain("Title must be 150 characters or less");
    expect(messages(CreateThreadDto, { ...valid, courseId: "" })).toContain("Select a course");
    expect(messages(CreateThreadDto, { ...valid, bodyHtml: "<p>tiny</p>" })).toContain("Write at least 20 characters");
    expect(messages(CreateThreadDto, { ...valid, bodyHtml: `<p>${"a".repeat(5001)}</p>` })).toContain("Keep it under 5000 characters");
    expect(messages(CreateThreadDto, { ...valid, tags: ["a"] })).toContain("Tags need at least 2 characters");
    expect(messages(CreateThreadDto, { ...valid, tags: ["x".repeat(25)] })).toContain("Tags must be 24 characters or less");
    expect(messages(CreateThreadDto, { ...valid, tags: ["no spaces"] })).toContain("Use letters, numbers and dashes");
    expect(messages(CreateThreadDto, { ...valid, tags: ["a1", "b1", "c1", "d1", "e1", "f1"] })).toContain("Up to 5 tags");
    expect(messages(CreateThreadDto, { ...valid, moduleId: "nope" })).toContain("Select a module");
  });

  it("reply, accept, resolution and student query", () => {
    expect(messages(CreateReplyDto, { bodyHtml: "<p>x</p>" })).toContain("Write a reply");
    expect(messages(CreateReplyDto, { bodyHtml: `<p>${"a".repeat(3001)}</p>` })).toContain("Keep it under 3000 characters");
    expect(messages(CreateReplyDto, { bodyHtml: "<p>Thanks!</p>", parentId: null })).toEqual([]);
    expect(messages(AcceptReplyDto, { replyId: null })).toEqual([]);
    expect(messages(AcceptReplyDto, {})).toContain("replyId must be a valid id or null");
    expect(messages(ResolveReportDto, { action: "DISMISS", note: "x".repeat(301) })).toContain("300 characters or less");
    expect(messages(ResolveReportDto, { action: "BAN" })).toContain("action must be DISMISS, REMOVE_CONTENT or HIDE_THREAD");
    expect(messages(StudentThreadQueryDto, { tab: "moderation" }).length).toBeGreaterThan(0);
    expect(plainToInstance(StudentThreadQueryDto, {})).toMatchObject({ tab: "all", sort: "activity", page: 1, limit: 10 });
  });
});
