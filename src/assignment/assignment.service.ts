import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CloudinaryService } from "../cloudinary/cloudinary.service";

@Injectable()
export class AssignmentService {
  constructor(
    private prisma: PrismaService,
    private cloudinary: CloudinaryService,
  ) {}

  async create(data: any) {
    return await this.prisma.assignment.create({ data });
  }

  async findAll(courseId: string) {
    return await this.prisma.assignment.findMany({ where: { courseId } });
  }

  async submit(
    assignmentId: string,
    userId: string,
    dto: any,
    file?: Express.Multer.File,
  ) {
    let fileUrl: string | undefined = undefined;

    if (file) {
      fileUrl = await this.cloudinary.uploadFile(file);
    }

    return await this.prisma.assignmentSubmission.create({
      data: {
        assignmentId,
        userId,
        fileUrl,
        textAnswer: dto.textAnswer,
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
