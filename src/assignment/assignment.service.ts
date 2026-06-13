import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AssignmentService {
  constructor(private prisma: PrismaService) {}

  async create(data: any) {
    return await this.prisma.assignment.create({ data });
  }

  async findAll(courseId: string) {
    return await this.prisma.assignment.findMany({ where: { courseId } });
  }

  async submit(
    userId: string,
    assignmentId: string,
    data: { fileUrl: string; textAnswer?: string },
  ) {
    return await this.prisma.assignmentSubmission.create({
      data: {
        assignmentId,
        userId,
        fileUrl: data.fileUrl,
        textAnswer: data.textAnswer,
        status: "PENDING",
      },
    });
  }

  async grade(
    submissionId: string,
    data: { marksObtained: number; feedback: string },
  ) {
    return await this.prisma.assignmentSubmission.update({
      where: { id: submissionId },
      data: {
        marksObtained: data.marksObtained,
        feedback: data.feedback,
        status: "GRADED",
      },
    });
  }
}
