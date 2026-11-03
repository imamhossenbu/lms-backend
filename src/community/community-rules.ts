import { plainTextLength } from "../common/html";
import { COMMUNITY_LIMITS as L, STUDENT_THREAD_CATEGORIES } from "./community.constants";
import type { ReportAction, ReportStatus, ThreadCategory } from "./community.types";

/** Cross-field / state rules shared by the admin and student sides. Pure. */

/** Length checks re-run on the sanitized HTML (stripping unsafe markup can empty a body that passed the DTO). */
export function threadBodyProblem(sanitized: string): string | null {
  const n = plainTextLength(sanitized);
  if (n < L.bodyMin) return "Write at least 20 characters";
  if (n > L.bodyMax) return `Keep it under ${L.bodyMax} characters`;
  return null;
}

export function replyBodyProblem(sanitized: string): string | null {
  const n = plainTextLength(sanitized);
  if (n < L.replyMin) return "Write a reply";
  if (n > L.replyMax) return `Keep it under ${L.replyMax} characters`;
  return null;
}

export const studentCategoryProblem = (category: ThreadCategory): string | null =>
  (STUDENT_THREAD_CATEGORIES as readonly string[]).includes(category) ? null : "Only instructors and admins can post announcements";

/** One level of nesting: replying to a nested reply attaches to its parent. */
export const replyParentId = (parent: { id: string; parentReplyId: string | null } | null): string | null => (parent ? (parent.parentReplyId ?? parent.id) : null);

/** Why a new reply can't be posted (null = allowed). Staff get the panel's "unlock it" hint. */
export function replyBlockedProblem(thread: { isLocked: boolean }, staff: boolean): string | null {
  if (!thread.isLocked) return null;
  return staff ? "This discussion is locked. Unlock it to reply." : "This discussion is locked. No new replies can be posted.";
}

/** Accepting an answer: QUESTION threads, top-level, not removed. null replyId = clear. */
export function acceptProblem(
  thread: { id: string; category: ThreadCategory },
  reply: { discussionId: string; parentReplyId: string | null; isRemoved: boolean } | null,
): string | null {
  if (thread.category !== "QUESTION") return "Only questions can have an accepted answer.";
  if (!reply) return null;
  if (reply.discussionId !== thread.id) return "This reply belongs to another discussion.";
  if (reply.parentReplyId) return "Only top-level replies can be accepted as the answer.";
  if (reply.isRemoved) return "A removed reply can't be accepted as the answer.";
  return null;
}

/** Reply + its nested replies (deleting a top-level reply deletes its thread of answers). */
export const replyIdsToDelete = (id: string, replies: { id: string; parentReplyId: string | null }[]): string[] => [
  id,
  ...replies.filter((r) => r.parentReplyId === id).map((r) => r.id),
];

export interface ReportEffects {
  status: Exclude<ReportStatus, "OPEN">;
  /** Soft-remove the reported reply (and drop its accepted mark). */
  removeReply: boolean;
  /** Hide + lock the thread. */
  hideThread: boolean;
}

/** What resolving a report does (= panel resolveReport). */
export function reportEffects(targetType: "THREAD" | "REPLY", action: ReportAction): ReportEffects {
  return {
    status: action === "DISMISS" ? "DISMISSED" : "ACTIONED",
    removeReply: action === "REMOVE_CONTENT" && targetType === "REPLY",
    hideThread: action === "HIDE_THREAD" || (action === "REMOVE_CONTENT" && targetType === "THREAD"),
  };
}

export function reportProblem(input: { reporterId: string; authorId: string; alreadyReported: boolean }): string | null {
  if (input.reporterId === input.authorId) return "You can't report your own post.";
  if (input.alreadyReported) return "You've already reported this. A moderator will review it.";
  return null;
}
