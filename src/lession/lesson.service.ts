import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "../../generated/prisma";
import { PrismaService } from "../prisma/prisma.service";

/** Upper bound for Lesson.editorSettings (JSON characters). */
const MAX_EDITOR_SETTINGS = 200_000;
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

  async findOne(userId: string, role: string, lessonId: string) {
    const staff = role === "ADMIN" || role === "TEACHER";
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { lessonResources: { where: staff ? {} : { isVisible: true }, orderBy: { order: "asc" } } },
      // Editor-only data (notes, quiz answers…) goes to staff only.
      omit: { editorSettings: !staff },
    });
    if (!lesson) throw new NotFoundException("Lesson not found");

    if (!lesson.isPreview && role !== "ADMIN" && role !== "TEACHER") {
      const hasAccess = await this.enrollmentService.hasAccess(
        userId,
        lesson.courseId,
      );
      if (!hasAccess) {
        throw new ForbiddenException(
          "You must be enrolled in this course to access this lesson.",
        );
      }
    }

    return lesson;
  }

  async update(id: string, dto: UpdateLessonDto) {
    const lesson = await this.prisma.lesson.findUnique({ where: { id } });
    if (!lesson) throw new NotFoundException("Lesson not found");

    // Moving between modules is only allowed inside the same course.
    if (dto.moduleId && dto.moduleId !== lesson.moduleId) {
      const target = await this.prisma.courseModule.findFirst({ where: { id: dto.moduleId, courseId: lesson.courseId }, select: { id: true } });
      if (!target) throw new NotFoundException("Target module not found in this course");
    }

    if (dto.editorSettings !== undefined && JSON.stringify(dto.editorSettings).length > MAX_EDITOR_SETTINGS)
      throw new BadRequestException("The lesson's editor settings are too large. Shorten the notes or SEO texts and try again.");
    const { editorSettings, ...fields } = dto;
    const updatedLesson = await this.prisma.lesson.update({
      where: { id },
      data: { ...fields, ...(editorSettings !== undefined && { editorSettings: editorSettings as Prisma.InputJsonValue }) },
    });

    await this.durationService.updateDurations(lesson.courseId, lesson.moduleId);
    if (dto.moduleId && dto.moduleId !== lesson.moduleId) await this.durationService.updateDurations(lesson.courseId, dto.moduleId);
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
