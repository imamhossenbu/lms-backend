import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { toAssignmentItem } from "../assignments/assignment.mapper";
import type { AssignmentItem } from "../assignments/assignments.types";
import type { SubmitAssignmentDto } from "../assignments/dto/submission.dto";
import { isLateAt, submissionProblem } from "../assignments/submission-gate";
import { CloudinaryService } from "../cloudinary/cloudinary.service";
import type { AuthUser } from "../common/auth-user";
import { PrismaService } from "../prisma/prisma.service";

/** Assignment as a student sees it: no AI-grading prompt, rubric only when it's visible to students. */
function forStudent(item: AssignmentItem): AssignmentItem {
  return {
    ...item,
    aiGrading: { enabled: item.aiGrading.enabled, criteria: "" },
    rubric: item.rubric.visibleToStudents ? item.rubric : { ...item.rubric, criteria: [] },
  };
}

@Injectable()
export class AssignmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService,
  ) {}

  private async assertEnrolled(user: AuthUser, courseId: string) {
    if (user.role === "ADMIN") return;
    const enrolled = await this.prisma.enrollment.findUnique({ where: { userId_courseId: { userId: user.userId, courseId } }, select: { id: true } });
    if (!enrolled) throw new ForbiddenException("Enroll in this course to see its assignments.");
  }

  /** Published + released assignments of the course, earliest due first. */
  async findAll(user: AuthUser, courseId: string): Promise<AssignmentItem[]> {
    await this.assertEnrolled(user, courseId);
    const now = new Date();
    const [rows, enrolledCount] = await Promise.all([
      this.prisma.assignment.findMany({
        where: { courseId, status: "PUBLISHED", OR: [{ releaseAt: null }, { releaseAt: { lte: now } }] },
        orderBy: { dueDate: "asc" },
      }),
      this.prisma.enrollment.count({ where: { courseId } }),
    ]);
    return rows.map((r) => forStudent(toAssignmentItem(r, enrolledCount)));
  }

  async findOne(user: AuthUser, id: string): Promise<AssignmentItem> {
    const row = await this.prisma.assignment.findFirst({ where: { id, status: "PUBLISHED" } });
    if (!row || (row.releaseAt && row.releaseAt > new Date())) throw new NotFoundException("Assignment not found");
    await this.assertEnrolled(user, row.courseId);
    return forStudent(toAssignmentItem(row, await this.prisma.enrollment.count({ where: { courseId: row.courseId } })));
  }

  getMySubmissions(userId: string) {
    return this.prisma.assignmentSubmission.findMany({
      where: { userId },
      orderBy: { submittedAt: "desc" },
      select: {
        id: true,
        assignmentId: true,
        submittedAt: true,
        attempt: true,
        isLate: true,
        status: true,
        marksObtained: true,
        feedback: true,
        fileUrl: true,
        fileName: true,
        textAnswer: true,
        gradedAt: true,
        assignment: { select: { title: true, marks: true, courseId: true } },
      },
    });
  }

  async submit(user: AuthUser, assignmentId: string, dto: SubmitAssignmentDto, file?: Express.Multer.File) {
    const assignment = await this.prisma.assignment.findUnique({ where: { id: assignmentId } });
    if (!assignment) throw new NotFoundException("Assignment not found");
    await this.assertEnrolled(user, assignment.courseId);

    const priorAttempts = await this.prisma.assignmentSubmission.count({ where: { assignmentId, userId: user.userId } });
    const now = new Date();
    const problem = submissionProblem(assignment, { ...dto, file }, priorAttempts, now);
    if (problem) throw new BadRequestException(problem);

    const fileUrl = assignment.type === "FILE_UPLOAD" && file ? await this.cloudinary.uploadFile(file, "assignments") : null;

    return this.prisma.assignmentSubmission.create({
      data: {
        assignmentId,
        userId: user.userId,
        fileUrl,
        fileName: fileUrl && file ? file.originalname : "",
        textAnswer: assignment.type === "TEXT" ? dto.textAnswer : assignment.type === "LINK" ? dto.link : null,
        timeTakenMinutes: dto.timeTakenMinutes === undefined ? null : Math.round(dto.timeTakenMinutes),
        attempt: priorAttempts + 1,
        isLate: isLateAt(assignment, now),
        status: "PENDING",
      },
    });
  }
}
