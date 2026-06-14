import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CertificateService } from "../certificate/certificate.service";

@Injectable()
export class EnrollmentService {
  constructor(
    private prisma: PrismaService,
  private certificateService: CertificateService
  ) {}

  async enrollUser(userId: string, courseId: string, tx: any = this.prisma) {
    const existing = await tx.enrollment.findFirst({
      where: { userId, courseId },
    });

    if (existing) return existing;

    return await tx.enrollment.create({
      data: {
        userId,
        courseId,
        status: "ACTIVE",
        enrolledAt: new Date(),
      },
    });
  }

  async hasAccess(userId: string, courseId: string): Promise<boolean> {
    const enrollment = await this.prisma.enrollment.findFirst({
      where: { userId, courseId, status: "ACTIVE" },
    });
    return !!enrollment;
  }

  async calculateAndSaveProgress(userId: string, courseId: string) {
    const totalLessons = await this.prisma.lesson.count({
      where: { courseId },
    });

    const completedLessons = await this.prisma.lessonProgress.count({
      where: { userId, courseId, isCompleted: true },
    });

    if (totalLessons === 0) return 0;

    const progressPercentage = Math.round(
      (completedLessons / totalLessons) * 100,
    );

    await this.prisma.enrollment.updateMany({
      where: { userId, courseId },
      data: { progressPercentage },
    });

    if (progressPercentage === 100) {
      await this.certificateService.generateCertificate(userId, courseId);
    }

    return progressPercentage;
  }
}
