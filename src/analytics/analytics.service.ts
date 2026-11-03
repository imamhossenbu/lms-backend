import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Performance and Revenue Analytics for Instructors
   */
  async getInstructorOverview(instructorId: string) {
    const courses = await this.prisma.course.findMany({
      where: { instructorId },
      include: {
        orders: {
          where: { status: "PAID" },
          select: { totalAmount: true },
        },
      },
    });

    const courseIds = courses.map((c) => c.id);

    const [totalEnrollments, certificatesIssued] = await Promise.all([
      this.prisma.enrollment.count({
        where: { courseId: { in: courseIds } },
      }),
      this.prisma.certificate.count({
        where: { courseId: { in: courseIds } },
      }),
    ]);

    let totalRevenue = 0;
    courses.forEach((c) => {
      c.orders.forEach((o) => {
        totalRevenue += Number(o.totalAmount);
      });
    });

    const courseStats = courses.map((c) => ({
      id: c.id,
      title: c.title,
      price: c.price,
      status: c.status,
      totalStudents: c.totalStudents,
      ratingAverage: c.ratingAverage,
      revenueGenerated: c.orders.reduce(
        (sum, o) => sum + Number(o.totalAmount),
        0,
      ),
    }));

    return {
      instructorOverview: {
        totalCourses: courses.length,
        totalStudents: totalEnrollments,
        totalCertificatesIssued: certificatesIssued,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        currency: "BDT",
      },
      courses: courseStats,
    };
  }
}
