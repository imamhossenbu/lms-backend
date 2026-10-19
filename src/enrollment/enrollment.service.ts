import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CertificateService } from "../certificate/certificate.service";

@Injectable()
export class EnrollmentService {
  constructor(
    private prisma: PrismaService,
    private certificateService: CertificateService,
  ) {}

  /**
   * Enroll user in a course and increment course student count
   */
  async enrollUser(userId: string, courseId: string, tx: any = this.prisma) {
    const existing = await tx.enrollment.findFirst({
      where: {
        userId,
        courseId,
      },
    });

    if (existing) {
      return existing;
    }

    const enrollment = await tx.enrollment.create({
      data: {
        userId,
        courseId,
        status: "ACTIVE",
        enrolledAt: new Date(),
      },
    });

    // Increment totalStudents on Course
    try {
      await tx.course.update({
        where: { id: courseId },
        data: { totalStudents: { increment: 1 } },
      });
    } catch {
      // Non-blocking if course counter update encounters an issue
    }

    return enrollment;
  }

  /**
   * Enroll in a free course directly without payment
   */
  async enrollFreeCourse(userId: string, courseId: string) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });

    if (!course) {
      throw new NotFoundException("Course not found");
    }

    if (!course.isFree && Number(course.price) > 0) {
      throw new BadRequestException(
        "This course is not free. Please complete payment to enroll.",
      );
    }

    const existing = await this.prisma.enrollment.findFirst({
      where: { userId, courseId, status: "ACTIVE" },
    });

    if (existing) {
      return {
        message: "You are already enrolled in this course.",
        enrollment: existing,
      };
    }

    const enrollment = await this.enrollUser(userId, courseId);
    return {
      message: "Successfully enrolled in free course",
      enrollment,
    };
  }

  /**
   * Check enrollment status for a specific user and course
   */
  async getEnrollmentStatus(userId: string, courseId: string) {
    const enrollment = await this.prisma.enrollment.findFirst({
      where: { userId, courseId, status: "ACTIVE" },
    });

    return {
      isEnrolled: !!enrollment,
      progressPercentage: enrollment?.progressPercentage || 0,
      enrolledAt: enrollment?.enrolledAt || null,
      status: enrollment?.status || null,
    };
  }

  /**
   * Get all enrolled courses for the logged-in student
   */
  async getMyEnrolledCourses(userId: string) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { userId, status: "ACTIVE" },
      orderBy: { enrolledAt: "desc" },
    });

    if (!enrollments.length) {
      return [];
    }

    const courseIds = enrollments.map((e) => e.courseId);

    const [courses, certificates] = await Promise.all([
      this.prisma.course.findMany({
        where: { id: { in: courseIds } },
        include: {
          category: true,
        },
      }),
      this.prisma.certificate.findMany({
        where: { userId, courseId: { in: courseIds } },
      }),
    ]);

    const courseMap = new Map(courses.map((c) => [c.id, c]));
    const certMap = new Map(certificates.map((c) => [c.courseId, c]));

    return enrollments.map((enr) => {
      const course = courseMap.get(enr.courseId) || null;
      const certificate = certMap.get(enr.courseId) || null;

      return {
        id: enr.id,
        courseId: enr.courseId,
        enrolledAt: enr.enrolledAt,
        status: enr.status,
        progressPercentage: enr.progressPercentage,
        completedAt: enr.completedAt,
        course,
        certificate: certificate
          ? {
              certificateNumber: certificate.certificateNumber,
              certificateUrl: certificate.certificateUrl,
              verificationCode: certificate.verificationCode,
              issuedAt: certificate.issuedAt,
            }
          : null,
      };
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

    const isComplete = progressPercentage === 100;

    await this.prisma.enrollment.updateMany({
      where: { userId, courseId },
      data: {
        progressPercentage,
        completedAt: isComplete ? new Date() : null,
      },
    });

    if (isComplete) {
      try {
        await this.certificateService.generateCertificate(userId, courseId);
      } catch (err) {
        console.error("Auto certificate generation error:", err);
      }
    }

    return progressPercentage;
  }
}
