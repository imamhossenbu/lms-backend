import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CloudinaryService } from "../cloudinary/cloudinary.service";

@Injectable()
export class AssignmentService {
  constructor(
    private prisma: PrismaService,
    private cloudinary: CloudinaryService,
  ) {}

  async create(data: any) {
    return await this.prisma.assignment.create({
      data: {
        ...data,
        dueDate: new Date(data.dueDate),
      },
    });
  }

  async findAll(courseId: string) {
    return await this.prisma.assignment.findMany({ where: { courseId } });
  }

  async findOne(id: string) {
    const assignment = await this.prisma.assignment.findUnique({ where: { id } });
    if (!assignment) throw new NotFoundException("Assignment not found");
    return assignment;
  }

  async getSubmissionsByAssignment(assignmentId: string) {
    const submissions = await this.prisma.assignmentSubmission.findMany({
      where: { assignmentId },
      orderBy: { submittedAt: "desc" },
    });

    const userIds = submissions.map((s) => s.userId);
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, email: true, avatar: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    return submissions.map((sub) => ({
      ...sub,
      user: userMap.get(sub.userId) || null,
    }));
  }

  async getMySubmissions(userId: string) {
    return await this.prisma.assignmentSubmission.findMany({
      where: { userId },
      orderBy: { submittedAt: "desc" },
    });
  }

  async submit(
    assignmentId: string,
    userId: string,
    dto: any,
    file?: Express.Multer.File,
  ) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
    });
    if (!assignment) throw new NotFoundException("Assignment not found");

    if (new Date() > new Date(assignment.dueDate)) {
      throw new BadRequestException("Assignment submission deadline has passed.");
    }

    let fileUrl: string | undefined = undefined;

    if (file) {
      fileUrl = await this.cloudinary.uploadFile(file);
    }

    return await this.prisma.assignmentSubmission.create({
      data: {
        assignmentId,
        userId,
        fileUrl,
        textAnswer: dto?.textAnswer,
        status: "PENDING",
      },
    });
  }

  async grade(
    submissionId: string,
    data: { marksObtained: number; feedback?: string; aiFeedback?: string },
  ) {
    return await this.prisma.assignmentSubmission.update({
      where: { id: submissionId },
      data: {
        marksObtained: data.marksObtained,
        feedback: data.feedback,
        aiFeedback: data.aiFeedback,
        status: "GRADED",
      },
    });
  }
}
