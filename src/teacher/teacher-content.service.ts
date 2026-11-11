import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { sanitizeRichText } from "../common/html";
import { instantToLocal, localToInstant } from "../common/workspace-time";
import { DurationService } from "../Duration/duration.service";
import { PLATFORM_HOSTS, PLATFORM_NAME } from "../live-classes/live-classes.constants";
import { PrismaService } from "../prisma/prisma.service";
import type { ModuleTitleDto, ReorderDto, TeacherLessonDto, TeacherLiveDto } from "./dto/teacher-content.dto";

const LESSON_FIELDS = { id: true, moduleId: true, title: true, type: true, durationMinutes: true, videoUrl: true, content: true, isPreview: true, status: true, order: true } as const;

/**
 * Teacher mode › course content and live classes. A teacher edits the curriculum (modules + lessons) of courses they
 * instruct and schedules / edits / cancels their live classes. Pricing, publishing the course and quizzes /
 * assignments stay with admins. Everything is scoped to `instructorId = me` inside the teacher's workspace.
 */
@Injectable()
export class TeacherContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly durations: DurationService,
  ) {}

  private async ownCourse(userId: string, tenantId: string | null, courseId: string) {
    const course = await this.prisma.course.findFirst({ where: { id: courseId, instructorId: userId, institutionId: tenantId }, select: { id: true, title: true } });
    if (!course) throw new NotFoundException("Course not found");
    return course;
  }

  private async ownModule(courseId: string, moduleId: string) {
    const mod = await this.prisma.courseModule.findFirst({ where: { id: moduleId, courseId }, select: { id: true } });
    if (!mod) throw new NotFoundException("Module not found");
    return mod;
  }

  private async ownLesson(courseId: string, lessonId: string) {
    const lesson = await this.prisma.lesson.findFirst({ where: { id: lessonId, courseId }, select: LESSON_FIELDS });
    if (!lesson) throw new NotFoundException("Lesson not found");
    return lesson;
  }

  // ---------------------------------------------------------------- modules

  async addModule(userId: string, tenantId: string | null, courseId: string, dto: ModuleTitleDto) {
    await this.ownCourse(userId, tenantId, courseId);
    const last = await this.prisma.courseModule.findFirst({ where: { courseId }, orderBy: { order: "desc" }, select: { order: true } });
    return this.prisma.courseModule.create({ data: { courseId, title: dto.title, order: (last?.order ?? 0) + 1 }, select: { id: true, title: true, order: true } });
  }

  async renameModule(userId: string, tenantId: string | null, courseId: string, moduleId: string, dto: ModuleTitleDto) {
    await this.ownCourse(userId, tenantId, courseId);
    await this.ownModule(courseId, moduleId);
    return this.prisma.courseModule.update({ where: { id: moduleId }, data: { title: dto.title }, select: { id: true, title: true, order: true } });
  }

  async deleteModule(userId: string, tenantId: string | null, courseId: string, moduleId: string) {
    await this.ownCourse(userId, tenantId, courseId);
    await this.ownModule(courseId, moduleId);
    if (await this.prisma.lesson.count({ where: { moduleId } })) throw new ConflictException("Move or delete this module's lessons first.");
    await this.prisma.courseModule.delete({ where: { id: moduleId } });
    return { ok: true };
  }

  /** New module order (must list every module of the course exactly once). */
  async reorderModules(userId: string, tenantId: string | null, courseId: string, dto: ReorderDto) {
    await this.ownCourse(userId, tenantId, courseId);
    const current = await this.prisma.courseModule.findMany({ where: { courseId }, select: { id: true } });
    this.assertSameSet(current.map((m) => m.id), dto.ids);
    await this.prisma.$transaction(dto.ids.map((id, i) => this.prisma.courseModule.update({ where: { id }, data: { order: i + 1 } })));
    return { ok: true };
  }

  async reorderLessons(userId: string, tenantId: string | null, courseId: string, moduleId: string, dto: ReorderDto) {
    await this.ownCourse(userId, tenantId, courseId);
    await this.ownModule(courseId, moduleId);
    const current = await this.prisma.lesson.findMany({ where: { moduleId }, select: { id: true } });
    this.assertSameSet(current.map((l) => l.id), dto.ids);
    await this.prisma.$transaction(dto.ids.map((id, i) => this.prisma.lesson.update({ where: { id }, data: { order: i + 1 } })));
    return { ok: true };
  }

  private assertSameSet(current: string[], next: string[]) {
    const a = new Set(current);
    if (next.length !== a.size || new Set(next).size !== next.length || next.some((id) => !a.has(id))) {
      throw new BadRequestException("The list changed while you were editing — reload and try again.");
    }
  }

  // ---------------------------------------------------------------- lessons

  async lesson(userId: string, tenantId: string | null, courseId: string, lessonId: string) {
    await this.ownCourse(userId, tenantId, courseId);
    return this.ownLesson(courseId, lessonId);
  }

  /** Published lessons need their main content (a video link, or text for TEXT / CODING lessons). */
  private assertPublishable(l: { status: string; type: string; videoUrl?: string | null; content?: string | null }) {
    if (l.status !== "PUBLISHED") return;
    if (l.type === "VIDEO" && !l.videoUrl) throw new BadRequestException("Add a video link before publishing a video lesson.");
    if ((l.type === "TEXT" || l.type === "CODING") && !(l.content ?? "").replace(/<[^>]*>/g, "").trim()) throw new BadRequestException("Write the lesson content before publishing it.");
  }

  async addLesson(userId: string, tenantId: string | null, courseId: string, dto: TeacherLessonDto) {
    await this.ownCourse(userId, tenantId, courseId);
    if (!dto.moduleId) throw new BadRequestException("Choose a module");
    await this.ownModule(courseId, dto.moduleId);
    const content = dto.content ? sanitizeRichText(dto.content) : "";
    this.assertPublishable({ ...dto, content });
    const last = await this.prisma.lesson.findFirst({ where: { moduleId: dto.moduleId }, orderBy: { order: "desc" }, select: { order: true } });
    const lesson = await this.prisma.lesson.create({
      data: { courseId, moduleId: dto.moduleId, title: dto.title, type: dto.type, durationMinutes: dto.durationMinutes, videoUrl: dto.videoUrl || null, content, isPreview: dto.isPreview ?? false, status: dto.status, order: (last?.order ?? 0) + 1 },
      select: LESSON_FIELDS,
    });
    await this.durations.updateDurations(courseId, dto.moduleId);
    return lesson;
  }

  async updateLesson(userId: string, tenantId: string | null, courseId: string, lessonId: string, dto: TeacherLessonDto) {
    await this.ownCourse(userId, tenantId, courseId);
    const before = await this.ownLesson(courseId, lessonId);
    const moduleId = dto.moduleId ?? before.moduleId;
    if (moduleId !== before.moduleId) await this.ownModule(courseId, moduleId);
    const content = dto.content !== undefined ? sanitizeRichText(dto.content) : before.content;
    const videoUrl = dto.videoUrl !== undefined ? dto.videoUrl || null : before.videoUrl;
    this.assertPublishable({ status: dto.status, type: dto.type, videoUrl, content });
    let order = before.order;
    if (moduleId !== before.moduleId) {
      const last = await this.prisma.lesson.findFirst({ where: { moduleId }, orderBy: { order: "desc" }, select: { order: true } });
      order = (last?.order ?? 0) + 1;
    }
    const lesson = await this.prisma.lesson.update({
      where: { id: lessonId },
      data: { moduleId, order, title: dto.title, type: dto.type, durationMinutes: dto.durationMinutes, videoUrl, content, isPreview: dto.isPreview ?? before.isPreview, status: dto.status },
      select: LESSON_FIELDS,
    });
    await this.durations.updateDurations(courseId, moduleId);
    if (moduleId !== before.moduleId) await this.durations.updateDurations(courseId, before.moduleId);
    return lesson;
  }

  /** Lessons learners already worked on, or with a quiz / assignment attached, are kept (set them to Draft instead). */
  async deleteLesson(userId: string, tenantId: string | null, courseId: string, lessonId: string) {
    await this.ownCourse(userId, tenantId, courseId);
    const lesson = await this.ownLesson(courseId, lessonId);
    const [progress, quizzes, assignments] = await Promise.all([
      this.prisma.lessonProgress.count({ where: { lessonId } }),
      this.prisma.quiz.count({ where: { lessonId } }),
      this.prisma.assignment.count({ where: { lessonId } }),
    ]);
    if (progress) throw new ConflictException("Learners have already started this lesson — set it to Draft to hide it instead.");
    if (quizzes || assignments) throw new ConflictException("A quiz or assignment is attached to this lesson — ask an admin to remove it first, or set the lesson to Draft.");
    await this.prisma.lesson.delete({ where: { id: lessonId } });
    await this.durations.updateDurations(courseId, lesson.moduleId);
    return { ok: true };
  }

  // ---------------------------------------------------------------- live classes

  private liveFields(dto: TeacherLiveDto) {
    if (dto.platform !== "CUSTOM") {
      const host = new URL(dto.meetingUrl).hostname;
      if (!PLATFORM_HOSTS[dto.platform].test(host)) throw new BadRequestException(`This doesn't look like a ${PLATFORM_NAME[dto.platform]} link`);
    }
    const start = localToInstant(dto.date, dto.startTime);
    if (!start || Number.isNaN(start.getTime())) throw new BadRequestException("Pick a date and start time");
    if (start.getTime() <= Date.now()) throw new BadRequestException("The class must start in the future");
    return {
      title: dto.title,
      description: dto.description || null,
      meetingUrl: dto.meetingUrl,
      platform: dto.platform,
      startTime: start,
      endTime: new Date(start.getTime() + dto.durationMinutes * 60_000),
    };
  }

  private async ownLive(userId: string, tenantId: string | null, id: string) {
    const live = await this.prisma.liveClass.findFirst({ where: { id, instructorId: userId, institutionId: tenantId, course: { instructorId: userId } } });
    if (!live) throw new NotFoundException("Live class not found");
    return live;
  }

  async liveClass(userId: string, tenantId: string | null, id: string) {
    const l = await this.ownLive(userId, tenantId, id);
    const { date, time } = instantToLocal(l.startTime);
    return { id: l.id, courseId: l.courseId, title: l.title, description: l.description ?? "", date, startTime: time, durationMinutes: Math.round((l.endTime.getTime() - l.startTime.getTime()) / 60_000), platform: l.platform, meetingUrl: l.meetingUrl, recordingUrl: l.recordingUrl ?? "", status: l.status };
  }

  async scheduleLive(userId: string, tenantId: string | null, dto: TeacherLiveDto) {
    await this.ownCourse(userId, tenantId, dto.courseId);
    const live = await this.prisma.liveClass.create({
      data: { ...this.liveFields(dto), courseId: dto.courseId, instructorId: userId, institutionId: tenantId, status: "SCHEDULED" },
      select: { id: true },
    });
    return this.liveClass(userId, tenantId, live.id);
  }

  async updateLive(userId: string, tenantId: string | null, id: string, dto: TeacherLiveDto) {
    const live = await this.ownLive(userId, tenantId, id);
    if (live.status === "CANCELLED" || live.startTime.getTime() <= Date.now()) throw new ConflictException("Only upcoming classes can be edited.");
    await this.ownCourse(userId, tenantId, dto.courseId);
    await this.prisma.liveClass.update({ where: { id }, data: { ...this.liveFields(dto), courseId: dto.courseId } });
    return this.liveClass(userId, tenantId, id);
  }

  async cancelLive(userId: string, tenantId: string | null, id: string) {
    const live = await this.ownLive(userId, tenantId, id);
    if (live.status === "CANCELLED" || live.startTime.getTime() <= Date.now()) throw new ConflictException("Only upcoming classes can be cancelled.");
    await this.prisma.liveClass.update({ where: { id }, data: { status: "CANCELLED" } });
    return { ok: true };
  }

  async setRecording(userId: string, tenantId: string | null, id: string, recordingUrl: string) {
    const live = await this.ownLive(userId, tenantId, id);
    if (live.endTime.getTime() > Date.now()) throw new ConflictException("Add the recording after the class ends.");
    await this.prisma.liveClass.update({ where: { id }, data: { recordingUrl: recordingUrl || null } });
    return { ok: true, recordingUrl: recordingUrl || null };
  }
}
