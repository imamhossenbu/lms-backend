import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { EnrollmentService } from "../../enrollment/enrollment.service";
import { lessonGate } from "../../lession/lesson-gate";
import { PrismaService } from "../../prisma/prisma.service";
import { sanitizeRichText } from "../../common/html";
import { LearnerAuthService } from "./learner-auth.service";

export interface PlayerLesson {
  id: string;
  title: string;
  type: string;
  durationMinutes: number;
  isPreview: boolean;
  completed: boolean;
  /** null = open; otherwise why it's locked (drip date, prerequisite…). */
  lockedReason: string | null;
}

/**
 * The course player of an academy site (/learn): outline with each lesson's completed / locked state, one
 * lesson's content (through the same publish / access / drip gate as everywhere else) and marking lessons done.
 * Enrolled learners of this academy only.
 */
@Injectable()
export class LearnerPlayerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly learners: LearnerAuthService,
    private readonly enrollments: EnrollmentService,
  ) {}

  private async enrolledCourse(slug: string, userId: string, courseSlug: string) {
    const inst = await this.learners.academy(slug);
    const [, course] = await Promise.all([
      this.learners.me(slug, userId),
      this.prisma.course.findFirst({
        where: { institutionId: inst.id, slug: courseSlug },
        select: { id: true, slug: true, title: true, thumbnail: true, status: true, instructor: { select: { name: true, avatar: true, headline: true } } },
      }),
    ]);
    if (!course) throw new NotFoundException("Course not found");
    const enrollment = await this.prisma.enrollment.findFirst({ where: { userId, courseId: course.id, status: "ACTIVE" } });
    if (!enrollment) throw new ForbiddenException({ statusCode: 403, code: "NOT_ENROLLED", message: "Enroll in this course to start learning." });
    return { course, enrollment };
  }

  /** Curriculum + this learner's completed lessons, loaded once (2 queries in parallel). */
  private async loadCurriculum(courseId: string, userId: string) {
    const [modules, done] = await Promise.all([
      this.prisma.courseModule.findMany({
        where: { courseId },
        orderBy: { order: "asc" },
        select: { id: true, title: true, lessons: { orderBy: { order: "asc" }, select: { id: true, title: true, type: true, durationMinutes: true, isPreview: true, status: true, editorSettings: true } } },
      }),
      this.prisma.lessonProgress.findMany({ where: { userId, courseId, isCompleted: true }, select: { lessonId: true } }),
    ]);
    return { modules, completed: new Set(done.map((d) => d.lessonId)) };
  }

  /** Outline from loaded data — the same rules as LessonAccessService.check, evaluated in memory (no per-lesson queries). */
  private buildOutline(
    course: { slug: string; title: string; thumbnail: string | null; instructor: { name: string; avatar: string | null; headline: string | null } },
    enrollment: { enrolledAt: Date; completedAt: Date | null },
    data: Awaited<ReturnType<LearnerPlayerService["loadCurriculum"]>>,
  ) {
    const curriculum = data.modules.flatMap((m) => m.lessons.map((l) => l.id));
    const out: { id: string; title: string; lessons: PlayerLesson[] }[] = [];
    for (const m of data.modules) {
      const lessons: PlayerLesson[] = [];
      for (const l of m.lessons) {
        const gate = lessonGate({ lesson: l, curriculum, enrolledAt: enrollment.enrolledAt, completedLessonIds: data.completed, country: null });
        if (!gate.allowed && gate.hidden) continue;
        lessons.push({ id: l.id, title: l.title, type: l.type, durationMinutes: l.durationMinutes, isPreview: l.isPreview, completed: data.completed.has(l.id), lockedReason: gate.allowed ? null : gate.message });
      }
      if (lessons.length) out.push({ id: m.id, title: m.title, lessons });
    }
    const all = out.flatMap((m) => m.lessons);
    const doneCount = all.filter((l) => l.completed).length;
    const next = all.find((l) => !l.completed && !l.lockedReason) ?? all.find((l) => !l.lockedReason) ?? null;
    return {
      course: { slug: course.slug, title: course.title, thumbnail: course.thumbnail, instructor: course.instructor },
      progress: all.length ? Math.round((doneCount / all.length) * 100) : 0,
      completedLessons: doneCount,
      totalLessons: all.length,
      completedAt: enrollment.completedAt,
      nextLessonId: next?.id ?? null,
      modules: out,
    };
  }

  async outline(slug: string, userId: string, courseSlug: string) {
    const { course, enrollment } = await this.enrolledCourse(slug, userId, courseSlug);
    const [data] = await Promise.all([this.loadCurriculum(course.id, userId), this.prisma.enrollment.update({ where: { id: enrollment.id }, data: { lastAccessedAt: new Date() } })]);
    return this.buildOutline(course, enrollment, data);
  }

  async lesson(slug: string, userId: string, courseSlug: string, lessonId: string) {
    const { course, enrollment } = await this.enrolledCourse(slug, userId, courseSlug);
    const [lesson, data, progress, quiz] = await Promise.all([
      this.prisma.lesson.findFirst({
        where: { id: lessonId, courseId: course.id },
        select: {
          id: true,
          title: true,
          type: true,
          content: true,
          videoUrl: true,
          durationMinutes: true,
          lessonResources: { where: { isVisible: true }, orderBy: { order: "asc" }, select: { id: true, title: true, fileUrl: true, fileType: true, size: true, description: true, isDownloadable: true } },
        },
      }),
      this.loadCurriculum(course.id, userId),
      this.prisma.lessonProgress.findUnique({ where: { userId_lessonId: { userId, lessonId } }, select: { isCompleted: true, lastPosition: true } }),
      this.prisma.quiz.findFirst({ where: { lessonId, status: "PUBLISHED" }, select: { id: true } }),
    ]);
    const row = data.modules.flatMap((m) => m.lessons).find((l) => l.id === lessonId);
    if (!lesson || !row) throw new NotFoundException("Lesson not found");
    // Same publish / access / drip rules as LessonAccessService, on the data already loaded.
    const gate = lessonGate({ lesson: row, curriculum: data.modules.flatMap((m) => m.lessons.map((l) => l.id)), enrolledAt: enrollment.enrolledAt, completedLessonIds: data.completed, country: null });
    if (!gate.allowed) {
      if (gate.hidden) throw new NotFoundException("Lesson not found");
      throw new ForbiddenException({ statusCode: 403, code: `LESSON_${gate.reason}`, message: gate.message });
    }
    const { lessonResources, ...rest } = lesson;
    const [assignment, live] = await Promise.all([lesson.type === "ASSIGNMENT" ? this.lessonAssignment(userId, lessonId) : null, lesson.type === "LIVE" ? this.nextLive(course.id) : null]);
    return { ...rest, resources: lessonResources, completed: !!progress?.isCompleted, lastPosition: progress?.lastPosition ?? 0, quizId: lesson.type === "QUIZ" ? (quiz?.id ?? null) : null, assignment, live };
  }

  /** The published assignment attached to an ASSIGNMENT lesson, with this learner's latest submission. */
  private async lessonAssignment(userId: string, lessonId: string) {
    const now = new Date();
    const a = await this.prisma.assignment.findFirst({
      where: { lessonId, status: "PUBLISHED", OR: [{ releaseAt: null }, { releaseAt: { lte: now } }] },
      select: {
        id: true, title: true, type: true, dueDate: true, marks: true, instructionsHtml: true, description: true, allowedFileTypes: true, maxFileSizeMb: true, maxAttempts: true, lateSubmission: true,
        submissions: { where: { userId }, orderBy: { submittedAt: "desc" }, select: { id: true, status: true, submittedAt: true, marksObtained: true, feedback: true, attempt: true, isLate: true, fileUrl: true, fileName: true, textAnswer: true } },
      },
    });
    if (!a) return null;
    const { submissions, ...rest } = a;
    const last = submissions[0] ?? null;
    const attemptsLeft = a.maxAttempts === null ? null : Math.max(0, a.maxAttempts - submissions.length);
    return {
      ...rest,
      state: last ? (last.status === "GRADED" ? "GRADED" : "SUBMITTED") : now > a.dueDate ? "OVERDUE" : "TODO",
      attempts: submissions.length,
      attemptsLeft,
      canSubmit: (attemptsLeft === null || attemptsLeft > 0) && !(now > a.dueDate && a.lateSubmission === "DISALLOW"),
      lastSubmission: last,
    };
  }

  /** The course's next (or current) live class; the meeting link only from 15 minutes before it starts. */
  private async nextLive(courseId: string) {
    const now = new Date();
    const r = await this.prisma.liveClass.findFirst({
      where: { courseId, status: { not: "CANCELLED" }, endTime: { gt: now } },
      orderBy: { startTime: "asc" },
      select: { id: true, title: true, startTime: true, endTime: true, meetingUrl: true, sendLinkToStudents: true },
    });
    if (!r) return null;
    const joinable = r.sendLinkToStudents && now.getTime() >= r.startTime.getTime() - 15 * 60_000;
    return { id: r.id, title: r.title, startTime: r.startTime, endTime: r.endTime, status: now >= r.startTime ? "LIVE" : "UPCOMING", joinUrl: joinable ? r.meetingUrl : null };
  }

  /** Remembers where the learner stopped a video (seconds). */
  async savePosition(slug: string, userId: string, courseSlug: string, lessonId: string, seconds: number) {
    const { course } = await this.enrolledCourse(slug, userId, courseSlug);
    const lesson = await this.prisma.lesson.findFirst({ where: { id: lessonId, courseId: course.id }, select: { id: true } });
    if (!lesson) throw new NotFoundException("Lesson not found");
    const s = Math.max(0, Math.min(Math.round(seconds), 24 * 3600));
    await this.prisma.lessonProgress.upsert({
      where: { userId_lessonId: { userId, lessonId } },
      update: { lastPosition: s, watchedSeconds: { increment: 0 } },
      create: { userId, lessonId, courseId: course.id, isCompleted: false, watchedSeconds: 0, lastPosition: s },
    });
    return { lastPosition: s };
  }

  // ---------------------------------------------------------------- course Q&A (community QUESTION threads)

  async questions(slug: string, userId: string, courseSlug: string) {
    const { course } = await this.enrolledCourse(slug, userId, courseSlug);
    const rows = await this.prisma.discussion.findMany({
      where: { courseId: course.id, category: "QUESTION", isHidden: false },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, title: true, body: true, isResolved: true, isLocked: true, createdAt: true, userId: true, replies: { where: { isRemoved: false }, orderBy: { createdAt: "asc" }, select: { id: true, body: true, userId: true, isAccepted: true, createdAt: true } } },
    });
    const ids = [...new Set(rows.flatMap((r) => [r.userId, ...r.replies.map((x) => x.userId)]))];
    const users = await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, avatar: true, role: true } });
    const who = (id: string) => {
      const u = users.find((x) => x.id === id);
      return { name: u?.name ?? "Learner", avatar: u?.avatar ?? null, isInstructor: u?.role === "TEACHER" || u?.role === "ADMIN", isMe: id === userId };
    };
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      bodyHtml: r.body,
      isResolved: r.isResolved,
      isLocked: r.isLocked,
      createdAt: r.createdAt,
      author: who(r.userId),
      replies: r.replies.map((x) => ({ id: x.id, bodyHtml: x.body, isAccepted: x.isAccepted, createdAt: x.createdAt, author: who(x.userId) })),
    }));
  }

  private toHtml(text: string) {
    const esc = text.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
    return sanitizeRichText(`<p>${esc.replace(/\n{2,}/g, "</p><p>").replace(/\n/g, "<br>")}</p>`);
  }

  async ask(slug: string, userId: string, courseSlug: string, title: string, body: string) {
    const { course } = await this.enrolledCourse(slug, userId, courseSlug);
    const inst = await this.prisma.course.findUniqueOrThrow({ where: { id: course.id }, select: { institutionId: true } });
    const row = await this.prisma.discussion.create({
      data: { institutionId: inst.institutionId, courseId: course.id, userId, title: title.trim(), body: this.toHtml(body.trim()), category: "QUESTION", updatedAt: new Date() },
      select: { id: true },
    });
    return row;
  }

  async replyTo(slug: string, userId: string, courseSlug: string, discussionId: string, body: string) {
    const { course } = await this.enrolledCourse(slug, userId, courseSlug);
    const thread = await this.prisma.discussion.findFirst({ where: { id: discussionId, courseId: course.id, isHidden: false }, select: { id: true, isLocked: true } });
    if (!thread) throw new NotFoundException("Question not found");
    if (thread.isLocked) throw new ForbiddenException("This question is closed for replies.");
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.discussionReply.create({ data: { discussionId, userId, body: this.toHtml(body.trim()), createdAt: now } }),
      this.prisma.discussion.update({ where: { id: discussionId }, data: { updatedAt: now } }),
    ]);
    return { ok: true };
  }

  async complete(slug: string, userId: string, courseSlug: string, lessonId: string) {
    const { course, enrollment } = await this.enrolledCourse(slug, userId, courseSlug);
    const data = await this.loadCurriculum(course.id, userId);
    const lesson = data.modules.flatMap((m) => m.lessons).find((l) => l.id === lessonId);
    if (!lesson) throw new NotFoundException("Lesson not found");
    const gate = lessonGate({ lesson, curriculum: data.modules.flatMap((m) => m.lessons.map((l) => l.id)), enrolledAt: enrollment.enrolledAt, completedLessonIds: data.completed, country: null });
    if (!gate.allowed) {
      if (gate.hidden) throw new NotFoundException("Lesson not found");
      throw new ForbiddenException({ statusCode: 403, code: `LESSON_${gate.reason}`, message: gate.message });
    }
    if (!data.completed.has(lessonId)) {
      await this.prisma.lessonProgress.upsert({
        where: { userId_lessonId: { userId, lessonId } },
        update: { isCompleted: true, completedAt: new Date() },
        create: { userId, lessonId, courseId: course.id, isCompleted: true, completedAt: new Date(), watchedSeconds: 0, lastPosition: 0 },
      });
      data.completed.add(lessonId);
      // Progress % on the enrollment + certificate auto-issue.
      await this.enrollments.calculateAndSaveProgress(userId, course.id);
    }
    const outline = this.buildOutline(course, enrollment, data);
    return { ...outline, completedAt: outline.progress === 100 ? (enrollment.completedAt ?? new Date()) : enrollment.completedAt };
  }
}
