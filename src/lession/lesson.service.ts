import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateLessonDto, UpdateLessonDto } from "./dto/lesson.dto";
import { DurationService } from "../Duration/duration.service";
import { EnrollmentService } from "../enrollment/enrollment.service";

@Injectable()
export class LessonService {
  constructor(
    private prisma: PrismaService,
    private durationService: DurationService,
    private enrollmentService: EnrollmentService,
  ) {}

  async create(courseId: string, moduleId: string, dto: CreateLessonDto) {
    const lesson = await this.prisma.lesson.create({
      data: { ...dto, courseId, moduleId, status: dto.status || "DRAFT" },
    });

    await this.durationService.updateDurations(courseId, moduleId);
    return lesson;
  }

  async findAllByModule(moduleId: string) {
    return await this.prisma.lesson.findMany({
      where: { moduleId },
      orderBy: { order: "asc" },
    });
  }

  async update(id: string, dto: UpdateLessonDto) {
    const lesson = await this.prisma.lesson.findUnique({ where: { id } });
    if (!lesson) throw new NotFoundException("Lesson not found");

    const updatedLesson = await this.prisma.lesson.update({
      where: { id },
      data: dto,
    });

    await this.durationService.updateDurations(
      lesson.courseId,
      lesson.moduleId,
    );
    return updatedLesson;
  }

  async delete(id: string) {
    const lesson = await this.prisma.lesson.findUnique({ where: { id } });
    if (!lesson) throw new NotFoundException("Lesson not found");

    const deletedLesson = await this.prisma.lesson.delete({ where: { id } });

    await this.durationService.updateDurations(
      lesson.courseId,
      lesson.moduleId,
    );
    return deletedLesson;
  }

  async completeLesson(userId: string, lessonId: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
    });
    if (!lesson) throw new NotFoundException("Lesson not found");

    const hasAccess = await this.enrollmentService.hasAccess(
      userId,
      lesson.courseId,
    );
    if (!hasAccess) {
      throw new ForbiddenException(
        "You must be enrolled to complete this lesson",
      );
    }

    await this.prisma.lessonProgress.upsert({
      where: { userId_lessonId: { userId, lessonId } },
      update: { isCompleted: true, completedAt: new Date() },
      create: {
        userId,
        lessonId,
        courseId: lesson.courseId,
        isCompleted: true,
        completedAt: new Date(),
        watchedSeconds: 0,
        lastPosition: 0,
      },
    });

    return await this.enrollmentService.calculateAndSaveProgress(
      userId,
      lesson.courseId,
    );
  }
}
