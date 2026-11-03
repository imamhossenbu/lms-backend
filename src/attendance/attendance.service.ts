import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { AuthUser } from "../common/auth-user";
import { ATTENDED_ROW_STATUSES } from "../live-classes/live-classes.constants";
import { LiveClassEventsService } from "../live-classes/services/live-class-events.service";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: LiveClassEventsService,
  ) {}

  /** Join a running class. Re-joining keeps the first join time. */
  async checkIn(user: AuthUser, liveClassId: string) {
    const c = await this.prisma.liveClass.findUnique({ where: { id: liveClassId }, select: { id: true, courseId: true, startTime: true, endTime: true, status: true } });
    if (!c) throw new NotFoundException("Live class not found.");
    if (c.status === "CANCELLED") throw new BadRequestException("This class was cancelled.");
    const now = Date.now();
    if (now < c.startTime.getTime()) throw new BadRequestException("This class has not started yet.");
    if (now > c.endTime.getTime()) throw new BadRequestException("This class has already ended.");
    const enrolled = await this.prisma.enrollment.findUnique({ where: { userId_courseId: { userId: user.userId, courseId: c.courseId } }, select: { id: true } });
    if (!enrolled) throw new ForbiddenException("You are not enrolled in this course.");

    const key = { userId_liveClassId: { userId: user.userId, liveClassId } };
    const existing = await this.prisma.attendance.findUnique({ where: key });
    if (existing?.joinedAt && ATTENDED_ROW_STATUSES.includes(existing.status)) {
      return this.prisma.attendance.update({ where: { id: existing.id }, data: { status: "ACTIVE", leftAt: null } });
    }
    const row = await this.prisma.attendance.upsert({
      where: key,
      create: { liveClassId, userId: user.userId, joinedAt: new Date(), durationMinutes: 0, status: "ACTIVE" },
      update: { joinedAt: new Date(), leftAt: null, status: "ACTIVE" },
      include: { user: { select: { name: true } } },
    });
    await this.events.log(liveClassId, "STUDENTS_JOINED", "Student Joined", `${row.user.name} joined the class.`, row.user.name);
    return row;
  }

  /** Heartbeat: +1 watched minute while the class runs. */
  async ping(user: AuthUser, id: string) {
    const row = await this.mustOwn(user, id);
    if (row.status !== "ACTIVE") throw new BadRequestException("You're not in this class right now.");
    if (row.liveClass.endTime.getTime() < Date.now()) throw new BadRequestException("This class has already ended.");
    return this.prisma.attendance.update({ where: { id }, data: { durationMinutes: { increment: 1 } } });
  }

  async checkOut(user: AuthUser, id: string) {
    const row = await this.mustOwn(user, id);
    if (row.status !== "ACTIVE") return row;
    return this.prisma.attendance.update({ where: { id }, data: { leftAt: new Date(), status: "COMPLETED" } });
  }

  private async mustOwn(user: AuthUser, id: string) {
    const row = await this.prisma.attendance.findUnique({ where: { id }, include: { liveClass: { select: { endTime: true } } } });
    if (!row || row.userId !== user.userId) throw new NotFoundException("Attendance record not found.");
    return row;
  }
}
