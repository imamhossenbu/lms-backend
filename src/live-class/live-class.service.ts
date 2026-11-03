import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { LiveClass } from "../../generated/prisma";
import type { AuthUser } from "../common/auth-user";
import { attendanceStatus, displayStatus, settingsOf, toLiveClassItem, toResource } from "../live-classes/live-class.mapper";
import { LiveClassEventsService } from "../live-classes/services/live-class-events.service";
import { PrismaService } from "../prisma/prisma.service";

/** Live class as a student sees it: no passcode / link unless shared, no internal settings. */
function forStudent(c: LiveClass, myStatus: string) {
  const item = toLiveClassItem(c);
  const share = c.sendLinkToStudents && c.status !== "CANCELLED";
  return {
    id: item.id,
    title: item.title,
    descriptionHtml: item.descriptionHtml,
    courseId: item.courseId,
    type: item.type,
    date: item.date,
    startTime: item.startTime,
    endTime: item.endTime,
    platform: item.platform,
    meetingLink: share ? item.meetingLink : "",
    meetingId: share ? item.meetingId : "",
    passcode: share ? item.passcode : "",
    thumbnailUrl: item.thumbnailUrl,
    allowQa: item.settings.allowQa,
    displayStatus: displayStatus(c),
    myStatus,
  };
}

@Injectable()
export class LiveClassService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: LiveClassEventsService,
  ) {}

  /** The class, if the student may see it (enrolled in its course). */
  async mustFindForStudent(user: AuthUser, id: string) {
    const c = await this.prisma.liveClass.findUnique({ where: { id } });
    if (!c) throw new NotFoundException("Live class not found.");
    await this.assertEnrolled(user, c.courseId);
    return c;
  }

  async assertEnrolled(user: AuthUser, courseId: string) {
    if (user.role === "ADMIN") return;
    const e = await this.prisma.enrollment.findUnique({ where: { userId_courseId: { userId: user.userId, courseId } }, select: { id: true } });
    if (!e) throw new ForbiddenException("You are not enrolled in this course.");
  }

  async listForCourse(user: AuthUser, courseId: string) {
    await this.assertEnrolled(user, courseId);
    const [classes, mine] = await Promise.all([
      this.prisma.liveClass.findMany({ where: { courseId }, orderBy: { startTime: "asc" } }),
      this.prisma.attendance.findMany({ where: { userId: user.userId, liveClass: { courseId } } }),
    ]);
    const byClass = new Map(mine.map((a) => [a.liveClassId, a]));
    const now = Date.now();
    return classes.map((c) => forStudent(c, attendanceStatus(byClass.get(c.id), c.endTime.getTime() <= now)));
  }

  /** "I'll attend" — creates the RSVP row (no-op when one exists). */
  async rsvp(user: AuthUser, id: string) {
    const c = await this.mustFindForStudent(user, id);
    if (c.status === "CANCELLED") throw new BadRequestException("This class was cancelled.");
    if (c.endTime.getTime() <= Date.now()) throw new BadRequestException("This class has already ended.");
    await this.prisma.attendance.upsert({
      where: { userId_liveClassId: { userId: user.userId, liveClassId: id } },
      create: { userId: user.userId, liveClassId: id, status: "RSVP", durationMinutes: 0 },
      update: {},
    });
    return { ok: true };
  }

  async ask(user: AuthUser, id: string, question: string) {
    const c = await this.mustFindForStudent(user, id);
    if (c.status === "CANCELLED") throw new BadRequestException("This class was cancelled.");
    if (!settingsOf(c.settings).allowQa) throw new BadRequestException("Questions are turned off for this class.");
    if (c.endTime.getTime() <= Date.now()) throw new BadRequestException("This class has already ended.");
    const q = await this.prisma.liveQuestion.create({ data: { liveClassId: id, userId: user.userId, question }, include: { user: { select: { name: true } } } });
    await this.events.log(id, "QUESTION_ASKED", "Question Asked", `${q.user.name} asked a question.`, q.user.name, q.id);
    return { id: q.id, question: q.question, status: q.status, createdAt: q.createdAt.toISOString() };
  }

  /** Visible resources: ALL_STUDENTS, plus ATTENDEES ones when the student attended. */
  async resources(user: AuthUser, id: string) {
    const c = await this.mustFindForStudent(user, id);
    const mine = await this.prisma.attendance.findUnique({ where: { userId_liveClassId: { userId: user.userId, liveClassId: id } } });
    const attended = attendanceStatus(mine ?? undefined, c.endTime.getTime() <= Date.now()) === "ATTENDED" || user.role === "ADMIN";
    const rows = await this.prisma.liveResource.findMany({
      where: { liveClassId: id, visibility: { in: attended ? ["ALL_STUDENTS", "ATTENDEES"] : ["ALL_STUDENTS"] } },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toResource);
  }
}
