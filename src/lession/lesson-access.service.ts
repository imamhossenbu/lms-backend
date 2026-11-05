import { ForbiddenException, Global, Injectable, Module, NotFoundException } from "@nestjs/common";
import type { Request } from "express";
import { PrismaModule } from "../prisma/prisma.module";
import { PrismaService } from "../prisma/prisma.service";
import { lessonGate, type LessonGateResult } from "./lesson-gate";

const STAFF = new Set(["ADMIN", "TEACHER", "SUPER_ADMIN"]);

/** ISO country of the request from common CDN headers (Cloudflare, Vercel, CloudFront), or null. */
export function requestCountry(req: Pick<Request, "headers"> | undefined): string | null {
  const h = req?.headers ?? {};
  const raw = h["cf-ipcountry"] ?? h["x-vercel-ip-country"] ?? h["cloudfront-viewer-country"] ?? h["x-country-code"];
  const v = (Array.isArray(raw) ? raw[0] : raw)?.trim().toUpperCase();
  return v && /^[A-Z]{2}$/.test(v) && v !== "XX" && v !== "T1" ? v : null;
}

/**
 * Applies the lesson's publish / access / drip rules (see lesson-gate.ts) for a student. Staff pass through.
 * Used by GET lesson, mark complete, the lesson's resources and the lesson's quiz.
 */
@Injectable()
export class LessonAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** The decision for `userId` on `lessonId` (null when the lesson doesn't exist). */
  async check(userId: string, role: string, lessonId: string, country: string | null): Promise<LessonGateResult | null> {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { id: true, courseId: true, status: true, isPreview: true, editorSettings: true },
    });
    if (!lesson) return null;
    if (STAFF.has(role)) return { allowed: true };
    const [modules, enrollment, done] = await Promise.all([
      this.prisma.courseModule.findMany({
        where: { courseId: lesson.courseId },
        orderBy: { order: "asc" },
        select: { lessons: { orderBy: { order: "asc" }, select: { id: true } } },
      }),
      this.prisma.enrollment.findFirst({ where: { userId, courseId: lesson.courseId, status: "ACTIVE" }, select: { enrolledAt: true } }),
      this.prisma.lessonProgress.findMany({ where: { userId, courseId: lesson.courseId, isCompleted: true }, select: { lessonId: true } }),
    ]);
    return lessonGate({
      lesson,
      curriculum: modules.flatMap((m) => m.lessons.map((l) => l.id)),
      enrolledAt: enrollment?.enrolledAt ?? null,
      completedLessonIds: new Set(done.map((d) => d.lessonId)),
      country,
    });
  }

  /** Throws 404 (missing / hidden lesson) or 403 (locked, with the reason) unless the user may open it. */
  async assert(userId: string, role: string, lessonId: string, country: string | null): Promise<void> {
    const result = await this.check(userId, role, lessonId, country);
    if (!result) throw new NotFoundException("Lesson not found");
    if (result.allowed) return;
    if (result.hidden) throw new NotFoundException("Lesson not found");
    throw new ForbiddenException({ statusCode: 403, code: `LESSON_${result.reason}`, message: result.message });
  }
}

@Global()
@Module({ imports: [PrismaModule], providers: [LessonAccessService], exports: [LessonAccessService] })
export class LessonAccessModule {}
