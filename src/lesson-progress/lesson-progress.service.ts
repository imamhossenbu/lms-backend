import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { EnrollmentService } from "../enrollment/enrollment.service";

@Injectable()
export class LessonProgressService {
  constructor(
    private prisma: PrismaService,
    private enrollmentService: EnrollmentService,
  ) {}

  /**
   * Get user's completed lessons and progress map for a course
   */
  async getCourseProgress(userId: string, courseId: string) {
    const [totalLessons, progresses, enrollment] = await Promise.all([
      this.prisma.lesson.count({ where: { courseId } }),
      this.prisma.lessonProgress.findMany({
        where: { userId, courseId },
        select: {
          lessonId: true,
          isCompleted: true,
          watchedSeconds: true,
          completedAt: true,
        },
      }),
      this.prisma.enrollment.findFirst({
        where: { userId, courseId, status: "ACTIVE" },
        select: { progressPercentage: true, completedAt: true },
      }),
    ]);

    const completedLessonIds = progresses
      .filter((p) => p.isCompleted)
      .map((p) => p.lessonId);

    return {
      courseId,
      totalLessons,
      completedLessonsCount: completedLessonIds.length,
      progressPercentage: enrollment?.progressPercentage || 0,
      isCourseCompleted: (enrollment?.progressPercentage || 0) === 100,
      completedLessonIds,
      progresses,
    };
  }

  async updateVideoProgress(
    userId: string,
    lessonId: string,
    watchedMinutes: number,
  ) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
    });
    if (!lesson) throw new NotFoundException("Lesson not found");

    const isCompleted = watchedMinutes >= lesson.durationMinutes;

    const progress = await this.prisma.lessonProgress.upsert({
      where: { userId_lessonId: { userId, lessonId } },
      update: {
        watchedSeconds: watchedMinutes,
        isCompleted: isCompleted,
        completedAt: isCompleted ? new Date() : null,
      },
      create: {
        userId,
        lessonId,
        courseId: lesson.courseId,
        watchedSeconds: watchedMinutes,
        isCompleted: isCompleted,
        completedAt: isCompleted ? new Date() : null,
      },
    });

    const enrollment = await this.enrollmentService.calculateAndSaveProgress(
      userId,
      lesson.courseId,
    );

    return {
      message: "Progress updated",
      progress,
      enrollment,
    };
  }

  async markAsCompleted(userId: string, lessonId: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
    });
    if (!lesson) throw new NotFoundException("Lesson not found");

    const progress = await this.prisma.lessonProgress.upsert({
      where: { userId_lessonId: { userId, lessonId } },
      update: { isCompleted: true, completedAt: new Date() },
      create: {
        userId,
        lessonId,
        courseId: lesson.courseId,
        isCompleted: true,
        completedAt: new Date(),
      },
    });

    const enrollment = await this.enrollmentService.calculateAndSaveProgress(
      userId,
      lesson.courseId,
    );

    return {
      message: "Lesson marked as completed",
      progress,
      enrollment,
    };
  }
}
