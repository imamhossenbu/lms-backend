import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { MailService } from "../../auth/mail/mail.service";
import type { AuthUser } from "../../common/auth-user";
import { PrismaService } from "../../prisma/prisma.service";
import { gradeErrors } from "../assignment-rules";
import { rubricOf, toSubmission } from "../assignment.mapper";
import { WORKSPACE_TIME_ZONE } from "../assignments.constants";
import type { AssignmentSubmission } from "../assignments.types";
import type { GradeSubmissionDto } from "../dto/submission.dto";
import { AssignmentsQueryService, submissionInclude } from "./assignments-query.service";

/** Grading and "remind students with pending work". */
@Injectable()
export class AssignmentSubmissionsService {
  private readonly logger = new Logger(AssignmentSubmissionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly query: AssignmentsQueryService,
    private readonly mail: MailService,
  ) {}

  async grade(actor: AuthUser, submissionId: string, dto: GradeSubmissionDto): Promise<AssignmentSubmission> {
    const sub = await this.prisma.assignmentSubmission.findFirst({
      where: { id: submissionId, assignment: this.query.scope(actor) },
      include: { assignment: { select: { marks: true, rubric: true } } },
    });
    if (!sub) throw new NotFoundException("This submission no longer exists.");

    const errors = gradeErrors(dto.score, sub.assignment.marks, dto.criterionScores, rubricOf(sub.assignment));
    if (errors.length) throw new BadRequestException(errors);

    const row = await this.prisma.assignmentSubmission.update({
      where: { id: submissionId },
      data: {
        status: "GRADED",
        marksObtained: dto.score,
        feedback: dto.feedback,
        ...(dto.criterionScores && { criterionScores: dto.criterionScores }),
        gradedAt: new Date(),
        gradedById: actor.userId,
      },
      include: submissionInclude,
    });
    return toSubmission(row);
  }

  /** Emails every enrolled student who hasn't submitted yet. Returns how many were reminded. */
  async sendPendingReminders(actor: AuthUser, assignmentId: string): Promise<{ reminded: number; failed: number }> {
    const assignment = await this.query.mustFind(actor, assignmentId);
    if (assignment.status === "DRAFT") throw new BadRequestException("Publish the assignment before sending reminders.");

    const [enrollments, submitted, sender, course] = await Promise.all([
      this.prisma.enrollment.findMany({ where: { courseId: assignment.courseId }, select: { user: { select: { id: true, name: true, email: true } } } }),
      this.prisma.assignmentSubmission.findMany({ where: { assignmentId }, select: { userId: true }, distinct: ["userId"] }),
      this.prisma.user.findUnique({ where: { id: actor.userId }, select: { name: true } }),
      this.prisma.course.findUnique({ where: { id: assignment.courseId }, select: { title: true } }),
    ]);
    const done = new Set(submitted.map((s) => s.userId));
    const pending = enrollments.map((e) => e.user).filter((u) => !done.has(u.id));

    const due = assignment.dueDate.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: WORKSPACE_TIME_ZONE });
    const results = await Promise.allSettled(
      pending.map((u) =>
        this.mail.sendAdminMessageEmail(
          u.email,
          u.name,
          sender?.name ?? "Your instructor",
          `Reminder: "${assignment.title}" is due ${due}`,
          `You haven't submitted "${assignment.title}" for ${course?.title ?? "your course"} yet.\nIt's due on ${due}. Please submit it before the deadline.`,
        ),
      ),
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed) this.logger.warn(`Assignment ${assignmentId}: ${failed} of ${pending.length} reminder emails failed`);
    return { reminded: pending.length - failed, failed };
  }
}
