import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { MailService } from "../../auth/mail/mail.service";
import type { AuthUser } from "../../common/auth-user";
import { plainTextLength, sanitizeRichText } from "../../common/html";
import { WORKSPACE_TIME_ZONE } from "../../common/workspace-time";
import { INSTRUCTOR_ROLE } from "../../instructors/instructors.constants";
import { PrismaService } from "../../prisma/prisma.service";
import { isRescheduled, liveClassRuleErrors } from "../live-class-rules";
import { fieldsOf, toEnrollment, toLiveClassData, toLiveClassItem, toQuestion, toResource } from "../live-class.mapper";
import { LIVE_COPY_SUFFIX, LIVE_LIMITS } from "../live-classes.constants";
import type { LiveClassFields, LiveClassListItem, LiveEnrollment, LiveQuestion, LiveResource } from "../live-classes.types";
import type { AnswerQuestionDto, CreateLiveClassDto, LiveResourceDto, SetAttendanceDto, UpdateLiveClassDto, UpdateLiveResourceDto } from "../dto/live-class.dto";
import { LiveClassEventsService } from "./live-class-events.service";
import { LiveClassesQueryService } from "./live-classes-query.service";
import { findCourseInTenant, tenantOf } from "../../common/tenancy";

const person = { select: { id: true, name: true, email: true } } as const;
const fmt = (d: Date) => d.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: WORKSPACE_TIME_ZONE });

/** Write side of admin Live Classes: schedule / edit / cancel / restore / duplicate / delete, attendance, Q&A, resources, reminders. */
@Injectable()
export class LiveClassAdminService {
  private readonly logger = new Logger(LiveClassAdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly query: LiveClassesQueryService,
    private readonly events: LiveClassEventsService,
    private readonly mail: MailService,
  ) {}

  private async actorName(user: AuthUser) {
    return (await this.prisma.user.findUnique({ where: { id: user.userId }, select: { name: true } }))?.name ?? "Admin";
  }

  // ---------------------------------------------------------------- classes

  async create(user: AuthUser, dto: CreateLiveClassDto): Promise<LiveClassListItem> {
    await this.assertValid(user, dto, { requireFuture: true });
    const row = await this.prisma.liveClass.create({ data: { ...toLiveClassData(dto), status: "ACTIVE", institutionId: user.institutionId ?? null } });
    await this.events.log(row.id, "CLASS_SCHEDULED", "Class Scheduled", `${row.title} was scheduled for ${dto.date}.`, await this.actorName(user));
    return this.query.detail(user, row.id);
  }

  async update(user: AuthUser, id: string, dto: UpdateLiveClassDto): Promise<LiveClassListItem> {
    const current = toLiveClassItem(await this.query.mustFind(user, id));
    if (dto.courseId && dto.courseId !== current.courseId) throw new BadRequestException("A live class can't be moved to another course.");
    const merged: LiveClassFields = { ...fieldsOf(current), ...dto, settings: dto.settings ? { ...dto.settings } : current.settings };
    const rescheduled = isRescheduled(current, merged);
    await this.assertValid(user, merged, { requireFuture: rescheduled, instructor: dto.instructorId !== undefined });
    await this.prisma.liveClass.update({ where: { id }, data: { ...toLiveClassData(merged), ...(rescheduled && { reminderSentAt: null }) } });
    await this.events.log(
      id,
      "CLASS_UPDATED",
      rescheduled ? "Class Rescheduled" : "Class Updated",
      rescheduled ? `Moved to ${merged.date} ${merged.startTime}–${merged.endTime}.` : "Class details were updated.",
      await this.actorName(user),
    );
    return this.query.detail(user, id);
  }

  /** Cancel and email the invited students. */
  async cancel(user: AuthUser, id: string): Promise<LiveClassListItem> {
    const c = await this.query.mustFind(user, id);
    if (c.status === "CANCELLED") throw new BadRequestException("This class is already cancelled.");
    if (c.endTime.getTime() <= Date.now()) throw new BadRequestException("A class that has already happened can't be cancelled.");
    await this.prisma.liveClass.update({ where: { id }, data: { status: "CANCELLED" } });
    const sender = await this.actorName(user);
    await this.events.log(id, "CLASS_CANCELLED", "Class Cancelled", "The class was cancelled and students were notified.", sender);
    const roster = await this.query.roster(c);
    void this.emailAll(roster, sender, `Cancelled: ${c.title}`, `"${c.title}" scheduled for ${fmt(c.startTime)} has been cancelled.`);
    return this.query.detail(user, id);
  }

  async restore(user: AuthUser, id: string): Promise<LiveClassListItem> {
    const c = await this.query.mustFind(user, id);
    if (c.status !== "CANCELLED") throw new BadRequestException("Only a cancelled class can be restored.");
    await this.prisma.liveClass.update({ where: { id }, data: { status: "ACTIVE" } });
    await this.events.log(id, "CLASS_UPDATED", "Class Restored", "The class was re-activated.", await this.actorName(user));
    return this.query.detail(user, id);
  }

  /** Copy with the same schedule and settings (no attendance, questions or resources). */
  async duplicate(user: AuthUser, id: string): Promise<LiveClassListItem> {
    const source = toLiveClassItem(await this.query.mustFind(user, id));
    const fields = { ...fieldsOf(source), title: `${source.title}${LIVE_COPY_SUFFIX}`.slice(0, LIVE_LIMITS.titleMax) };
    const row = await this.prisma.liveClass.create({ data: { ...toLiveClassData(fields), status: "ACTIVE", institutionId: user.institutionId ?? null } });
    await this.events.log(row.id, "CLASS_SCHEDULED", "Class Scheduled", `${row.title} was scheduled for ${fields.date}.`, await this.actorName(user));
    return this.query.detail(user, row.id);
  }

  async remove(user: AuthUser, id: string): Promise<{ id: string }> {
    await this.query.mustFind(user, id);
    await this.prisma.liveClass.delete({ where: { id } }); // attendance, questions, resources, events cascade
    return { id };
  }

  // ---------------------------------------------------------------- attendance / reminders

  /** Manual override. ATTENDED = present for the whole class; NOT_JOINED clears the row. */
  async setAttendance(user: AuthUser, id: string, studentId: string, dto: SetAttendanceDto): Promise<LiveEnrollment> {
    const c = await this.query.mustFind(user, id);
    const student = await this.prisma.user.findFirst({ where: { id: studentId, institutionId: user.institutionId ?? null }, ...person });
    if (!student) throw new NotFoundException("This student no longer exists.");
    const enrolled = await this.prisma.enrollment.findUnique({ where: { userId_courseId: { userId: studentId, courseId: c.courseId } }, select: { enrolledAt: true } });
    if (!enrolled) throw new BadRequestException("This student isn't enrolled in the class's course.");
    if (dto.status === "ATTENDED" && c.startTime.getTime() > Date.now()) throw new BadRequestException("Attendance can be marked once the class has started.");

    const key = { userId_liveClassId: { userId: studentId, liveClassId: id } };
    if (dto.status === "NOT_JOINED") {
      await this.prisma.attendance.deleteMany({ where: { userId: studentId, liveClassId: id } });
      return toEnrollment(id, student, enrolled.enrolledAt, undefined, c.endTime.getTime() <= Date.now());
    }
    const minutes = Math.round((c.endTime.getTime() - c.startTime.getTime()) / 60_000);
    const data =
      dto.status === "ATTENDED"
        ? { status: "ATTENDED", joinedAt: c.startTime, leftAt: c.endTime, durationMinutes: minutes }
        : { status: "ABSENT", joinedAt: null, leftAt: null, durationMinutes: 0 };
    const row = await this.prisma.attendance.upsert({ where: key, create: { ...data, userId: studentId, liveClassId: id }, update: data });
    return toEnrollment(id, student, enrolled.enrolledAt, row, c.endTime.getTime() <= Date.now());
  }

  async sendReminders(user: AuthUser, id: string, onlyNotJoined = false): Promise<{ reminded: number; failed: number }> {
    const c = await this.query.mustFind(user, id);
    if (c.status === "CANCELLED") throw new BadRequestException("This class is cancelled.");
    if (c.endTime.getTime() <= Date.now()) throw new BadRequestException("This class has already ended.");
    const roster = (await this.query.roster(c)).filter((r) => !onlyNotJoined || r.status !== "ATTENDED");
    const link = c.sendLinkToStudents ? `\nJoin here: ${c.meetingUrl}` : "";
    return this.emailAll(roster, await this.actorName(user), `Reminder: ${c.title}`, `"${c.title}" starts ${fmt(c.startTime)}.${link}`);
  }

  private async emailAll(rows: LiveEnrollment[], sender: string, subject: string, body: string) {
    const results = await Promise.allSettled(rows.map((r) => this.mail.sendAdminMessageEmail(r.student.email, r.student.name, sender, subject, body)));
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed) this.logger.warn(`${subject}: ${failed} of ${rows.length} emails failed`);
    return { reminded: rows.length - failed, failed };
  }

  // ---------------------------------------------------------------- Q&A

  async answer(user: AuthUser, id: string, questionId: string, dto: AnswerQuestionDto): Promise<LiveQuestion> {
    await this.query.mustFind(user, id);
    const q = await this.prisma.liveQuestion.findFirst({ where: { id: questionId, liveClassId: id } });
    if (!q) throw new NotFoundException("This question no longer exists.");
    const answerHtml = sanitizeRichText(dto.answerHtml);
    if (dto.status === "ANSWERED" && plainTextLength(answerHtml) < 2) throw new BadRequestException("Write the answer before marking it answered");
    if (plainTextLength(answerHtml) > LIVE_LIMITS.answerMax) throw new BadRequestException(`Answers must be ${LIVE_LIMITS.answerMax} characters or less`);
    const row = await this.prisma.liveQuestion.update({
      where: { id: questionId },
      data: { answerHtml, status: dto.status, ...(dto.status === "ANSWERED" ? { answeredById: user.userId, answeredAt: new Date() } : { answeredById: null, answeredAt: null }) },
      include: { user: person },
    });
    if (dto.status === "ANSWERED" && q.status !== "ANSWERED") {
      const name = await this.actorName(user);
      await this.events.log(id, "QUESTION_ANSWERED", "Instructor Answered", `${name} answered a question.`, name, questionId);
    }
    return toQuestion(row);
  }

  // ---------------------------------------------------------------- resources

  async addResource(user: AuthUser, id: string, dto: LiveResourceDto): Promise<LiveResource> {
    await this.query.mustFind(user, id);
    const row = await this.prisma.liveResource.create({ data: { ...dto, size: dto.type === "LINK" ? 0 : dto.size, liveClassId: id } });
    await this.events.log(id, "RESOURCE_SHARED", "Resource Shared", `${row.title} was shared.`, await this.actorName(user), row.id);
    return toResource(row);
  }

  async updateResource(user: AuthUser, id: string, resourceId: string, dto: UpdateLiveResourceDto): Promise<LiveResource> {
    await this.mustFindResource(user, id, resourceId);
    return toResource(await this.prisma.liveResource.update({ where: { id: resourceId }, data: dto }));
  }

  async removeResource(user: AuthUser, id: string, resourceId: string): Promise<{ id: string }> {
    await this.mustFindResource(user, id, resourceId);
    await this.prisma.liveResource.delete({ where: { id: resourceId } });
    return { id: resourceId };
  }

  private async mustFindResource(user: AuthUser, id: string, resourceId: string) {
    await this.query.mustFind(user, id);
    const r = await this.prisma.liveResource.findFirst({ where: { id: resourceId, liveClassId: id } });
    if (!r) throw new NotFoundException("This resource no longer exists.");
    return r;
  }

  // ---------------------------------------------------------------- validation

  private async assertValid(user: AuthUser, f: LiveClassFields, opts: { requireFuture: boolean; instructor?: boolean }) {
    const errors = liveClassRuleErrors(f, { requireFuture: opts.requireFuture });
    if (errors.length) throw new BadRequestException(errors);
    await findCourseInTenant(this.prisma, tenantOf(user), f.courseId, { id: true });
    if (opts.instructor !== false) {
      const instructor = await this.prisma.user.findFirst({
        where: { id: f.instructorId, institutionId: user.institutionId ?? null, role: { in: [INSTRUCTOR_ROLE, "ADMIN"] } },
        select: { id: true },
      });
      if (!instructor) throw new BadRequestException("Select an instructor from your workspace");
    }
  }
}
