import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "../../../generated/prisma";
import { assertCoursesInTenant } from "../../common/tenancy";
import { PrismaService } from "../../prisma/prisma.service";

type Tx = Prisma.TransactionClient;

/** Manual (admin) enrollments. Keeps `Course.totalStudents` in sync. */
@Injectable()
export class StudentEnrollmentsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Enrolls in every course not already enrolled; returns the newly enrolled course ids. */
  async enrollInTx(tx: Tx, studentId: string, courseIds: string[]): Promise<string[]> {
    // Only courses from the student's own workspace.
    const student = await tx.user.findUniqueOrThrow({ where: { id: studentId }, select: { institutionId: true } });
    await assertCoursesInTenant(tx, student.institutionId, courseIds);

    const existing = await tx.enrollment.findMany({ where: { userId: studentId, courseId: { in: courseIds } }, select: { courseId: true } });
    const already = new Set(existing.map((e) => e.courseId));
    const fresh = courseIds.filter((id) => !already.has(id));
    if (fresh.length === 0) return [];

    await tx.enrollment.createMany({ data: fresh.map((courseId) => ({ userId: studentId, courseId, status: "ACTIVE" })), skipDuplicates: true });
    await tx.course.updateMany({ where: { id: { in: fresh } }, data: { totalStudents: { increment: 1 } } });
    return fresh;
  }

  async enroll(studentId: string, courseIds: string[]) {
    const enrolled = await this.prisma.$transaction((tx) => this.enrollInTx(tx, studentId, courseIds));
    return { enrolledCourseIds: enrolled, skipped: courseIds.length - enrolled.length };
  }

  /** Removes the enrollment (progress records stay for history). */
  async unenroll(studentId: string, courseId: string) {
    return this.prisma.$transaction(async (tx) => {
      const deleted = await tx.enrollment.deleteMany({ where: { userId: studentId, courseId } });
      if (deleted.count === 0) throw new NotFoundException("This student isn't enrolled in that course.");
      await tx.course.updateMany({ where: { id: courseId, totalStudents: { gt: 0 } }, data: { totalStudents: { decrement: 1 } } });
      return { courseId, unenrolled: true };
    });
  }
}
