import type { Discussion, DiscussionReply, DiscussionReport } from "../../generated/prisma";
import { DELETED_MEMBER_NAME, REPORT_REASONS, REPORT_STATUSES, STUDENT_ROLE, TEACHER_ROLE, THREAD_CATEGORIES } from "./community.constants";
import type { CommunityMember, CommunityRole, CommunityThread, ReportReason, ReportStatus, ThreadCategory, ThreadReply, ThreadReport } from "./community.types";

/** DB rows ⇄ panel shapes. Pure. Legacy rows (no flags, plain-text body, comma tags, no FK to User) map defensively. */

export interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
}
export type Members = Map<string, UserRow>;

export const communityRole = (role: string): CommunityRole => (role === STUDENT_ROLE ? "STUDENT" : role === TEACHER_ROLE ? "INSTRUCTOR" : "ADMIN");

export function toMember(id: string, members: Members): CommunityMember {
  const u = members.get(id);
  if (!u) return { id, name: DELETED_MEMBER_NAME, email: "", role: "STUDENT" };
  return { id: u.id, name: u.name, email: u.email, role: communityRole(u.role) };
}

/** "a, b,c" → ["a","b","c"] (lower-case, unique, empty dropped). */
export const tagsOf = (raw: string | null | undefined): string[] =>
  Array.from(new Set((raw ?? "").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean)));

/** Tags column value; null when there are none. */
export const joinTags = (tags: string[]): string | null => {
  const clean = Array.from(new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean)));
  return clean.length ? clean.join(",") : null;
};

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Legacy bodies may be plain text: wrap them in a paragraph so the panel renders them as rich text. */
export const bodyHtmlOf = (body: string): string => (/<[a-z][^>]*>/i.test(body) ? body : body.trim() ? `<p>${escapeHtml(body)}</p>` : "");

const oneOf = <T extends string>(values: readonly T[], v: string, fallback: T): T => ((values as readonly string[]).includes(v) ? (v as T) : fallback);
export const categoryOf = (v: string): ThreadCategory => oneOf<ThreadCategory>(THREAD_CATEGORIES, v, "DISCUSSION");
const iso = (d: Date | null | undefined, fallback: Date) => (d ?? fallback).toISOString();

export function toThread(d: Discussion, members: Members): CommunityThread {
  return {
    id: d.id,
    title: d.title,
    bodyHtml: bodyHtmlOf(d.body),
    category: categoryOf(d.category),
    courseId: d.courseId,
    moduleId: d.moduleId ?? "",
    tags: tagsOf(d.tags),
    author: toMember(d.userId, members),
    isPinned: d.isPinned,
    isLocked: d.isLocked,
    isHidden: d.isHidden,
    views: d.views,
    likes: d.likes,
    createdAt: d.createdAt.toISOString(),
    updatedAt: iso(d.updatedAt, d.createdAt),
  };
}

export function toReply(r: DiscussionReply, members: Members): ThreadReply {
  return {
    id: r.id,
    threadId: r.discussionId,
    parentId: r.parentReplyId ?? null,
    author: toMember(r.userId, members),
    bodyHtml: bodyHtmlOf(r.body),
    likes: r.likes,
    isAccepted: r.isAccepted,
    isRemoved: r.isRemoved,
    createdAt: r.createdAt.toISOString(),
    updatedAt: iso(r.updatedAt, r.createdAt),
  };
}

export function toReport(r: DiscussionReport, members: Members): ThreadReport {
  return {
    id: r.id,
    targetId: r.targetId,
    targetType: r.targetType === "REPLY" ? "REPLY" : "THREAD",
    threadId: r.threadId,
    reporter: toMember(r.reporterId, members),
    reason: oneOf<ReportReason>(REPORT_REASONS, r.reason, "OTHER"),
    note: r.note,
    status: oneOf<ReportStatus>(REPORT_STATUSES, r.status, "OPEN"),
    createdAt: r.createdAt.toISOString(),
    ...(r.resolutionNote && { resolutionNote: r.resolutionNote }),
    ...(r.resolvedAt && { resolvedAt: r.resolvedAt.toISOString() }),
  };
}

/** What a student sees: no e-mail addresses, removed replies without their body. */
export const publicMember = (m: CommunityMember): CommunityMember => ({ ...m, email: "" });
export const forStudentThread = (t: CommunityThread): CommunityThread => ({ ...t, author: publicMember(t.author) });
export const forStudentReply = (r: ThreadReply): ThreadReply => ({ ...r, author: publicMember(r.author), bodyHtml: r.isRemoved ? "" : r.bodyHtml });
