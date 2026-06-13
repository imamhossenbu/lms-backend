import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { EnrollmentService } from "../enrollment/enrollment.service";

@Injectable()
export class LessonProgressService {
  constructor(
    private prisma: PrismaService,
    private enrollmentService: EnrollmentService,
  ) {}

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
