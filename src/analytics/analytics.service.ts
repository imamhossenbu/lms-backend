import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Comprehensive System Analytics for Admin Dashboard
   */
  async getAdminOverview() {
    const [
      totalStudents,
      totalInstructors,
      totalCourses,
      publishedCourses,
      totalEnrollments,
      totalCertificates,
      paidOrders,
    ] = await Promise.all([
      this.prisma.user.count({ where: { role: "STUDENT" } }),
      this.prisma.user.count({ where: { role: "TEACHER" } }),
      this.prisma.course.count(),
      this.prisma.course.count({ where: { status: "PUBLISHED" } }),
      this.prisma.enrollment.count(),
      this.prisma.certificate.count(),
      this.prisma.order.findMany({
        where: { status: "PAID" },
        select: { totalAmount: true, createdAt: true },
      }),
    ]);

    const totalRevenue = paidOrders.reduce(
      (sum, o) => sum + Number(o.totalAmount),
      0,
    );

    // Recent 5 paid orders
    const recentOrders = await this.prisma.order.findMany({
      where: { status: "PAID" },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        course: { select: { id: true, title: true, price: true } },
      },
    });

    // Top 5 popular courses
    const topCourses = await this.prisma.course.findMany({
      orderBy: { totalStudents: "desc" },
      take: 5,
      select: {
        id: true,
        title: true,
        totalStudents: true,
        ratingAverage: true,
        price: true,
        status: true,
      },
    });

    return {
      overview: {
        totalStudents,
        totalInstructors,
        totalCourses,
        publishedCourses,
        totalEnrollments,
        totalCertificatesIssued: totalCertificates,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        currency: "BDT",
      },
      topCourses,
      recentOrders,
    };
  }

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
