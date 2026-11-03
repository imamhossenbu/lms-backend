/**
 * Response shapes for the admin panel's Community pages — they mirror `lms-admin-panel/src/types/community.ts`
 * and `lib/communityStats.ts` field for field, so the panel can swap its localStorage mock for these endpoints.
 */

export type CommunityRole = "STUDENT" | "INSTRUCTOR" | "ADMIN";
export type ThreadCategory = "QUESTION" | "DISCUSSION" | "ANNOUNCEMENT" | "SHOWCASE" | "FEEDBACK";
export type ReportReason = "SPAM" | "ABUSIVE" | "OFF_TOPIC" | "PLAGIARISM" | "OTHER";
export type ReportStatus = "OPEN" | "DISMISSED" | "ACTIONED";
export type ReportAction = "DISMISS" | "REMOVE_CONTENT" | "HIDE_THREAD";
export type ThreadFlag = "isPinned" | "isLocked" | "isHidden";
export type CommunityTab = "all" | "unanswered" | "moderation" | "pinned" | "resolved" | "hidden";
export type CommunitySort = "activity" | "newest" | "replies" | "views";

export interface CommunityMember {
  id: string;
  name: string;
  email: string;
  role: CommunityRole;
}

export interface ThreadReport {
  id: string;
  targetId: string;
  targetType: "THREAD" | "REPLY";
  threadId: string;
  reporter: CommunityMember;
  reason: ReportReason;
  note: string;
  status: ReportStatus;
  createdAt: string;
  resolutionNote?: string;
  resolvedAt?: string;
}

export interface ThreadReply {
  id: string;
  threadId: string;
  parentId: string | null;
  author: CommunityMember;
  bodyHtml: string;
  likes: number;
  isAccepted: boolean;
  isRemoved: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CommunityThread {
  id: string;
  title: string;
  bodyHtml: string;
  category: ThreadCategory;
  courseId: string;
  /** "" = course-wide. */
  moduleId: string;
  tags: string[];
  author: CommunityMember;
  isPinned: boolean;
  isLocked: boolean;
  isHidden: boolean;
  views: number;
  likes: number;
  createdAt: string;
  updatedAt: string;
}

/** Thread + its derived numbers (= panel `ThreadView`). */
export interface ThreadView {
  thread: CommunityThread;
  replyCount: number;
  isResolved: boolean;
  isUnanswered: boolean;
  openReports: number;
  lastActivityAt: string;
  lastReplier: CommunityMember | null;
  participants: CommunityMember[];
}

/** List row: ThreadView + the course title (the panel used its mock catalog for it). */
export interface ThreadListItem extends ThreadView {
  courseTitle: string;
}

export interface ThreadBundle {
  thread: CommunityThread;
  replies: ThreadReply[];
  reports: ThreadReport[];
}

/** Everything the pure helpers need (= panel `CommunitySeed`). */
export interface CommunityData {
  threads: CommunityThread[];
  replies: ThreadReply[];
  reports: ThreadReport[];
}

export interface CommunityStats {
  total: number;
  activeThisWeek: number;
  activeDelta: number | null;
  repliesThisWeek: number;
  repliesDelta: number | null;
  unanswered: number;
  flagged: number;
  openReports: number;
  answerRate: number;
}

export interface TopContributor {
  member: CommunityMember;
  replies: number;
  accepted: number;
  likes: number;
}

export interface TrendingTag {
  tag: string;
  score: number;
}

export interface ModerationQueueItem {
  view: ThreadListItem;
  count: number;
  reporters: number;
  topReason: ReportReason;
  otherReasons: number;
  latest: string;
}

export type TabCounts = Record<CommunityTab, number>;
