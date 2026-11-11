import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { EnrollmentService } from "../../enrollment/enrollment.service";
import { lessonGate } from "../../lession/lesson-gate";
import { PrismaService } from "../../prisma/prisma.service";
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
    return { ...rest, resources: lessonResources, completed: !!progress?.isCompleted, lastPosition: progress?.lastPosition ?? 0, quizId: lesson.type === "QUIZ" ? (quiz?.id ?? null) : null };
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
