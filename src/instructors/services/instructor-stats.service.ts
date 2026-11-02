import { Injectable } from "@nestjs/common";
import { Prisma } from "../../../generated/prisma";
import { PrismaService } from "../../prisma/prisma.service";
import { APPROVED_REVIEW_STATUS, courseStatusLabel, DEFAULT_CURRENCY, PAID_ORDER_STATUS, round1, round2 } from "../instructors.constants";
import type { InstructorCourseRow, InstructorListItem } from "../instructors.types";

/** Numbers shown on list rows / the details header. */
export type InstructorSummary = Pick<InstructorListItem, "coursesCount" | "studentsCount" | "totalRevenue" | "rating" | "reviewsCount"> & {
  teachingMinutes: number;
};

interface CourseStats {
  students: number;
  lessons: number;
  revenue: number;
  ratingSum: number;
  reviews: number;
}

const emptySummary = (): InstructorSummary => ({
  coursesCount: 0,
  studentsCount: 0,
  totalRevenue: { amount: 0, currency: DEFAULT_CURRENCY },
  rating: 0,
  reviewsCount: 0,
  teachingMinutes: 0,
});

/** Aggregated teaching stats — every method runs a fixed number of grouped queries (no N+1). */
@Injectable()
export class InstructorStatsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Per-course students, lessons, paid revenue and approved-review totals. */
  async courseStats(courseIds: string[]): Promise<Map<string, CourseStats>> {
    const stats = new Map<string, CourseStats>(courseIds.map((id) => [id, { students: 0, lessons: 0, revenue: 0, ratingSum: 0, reviews: 0 }]));
    if (courseIds.length === 0) return stats;
    const inCourses = { courseId: { in: courseIds } };

    const [enrollments, lessons, revenue, reviews] = await Promise.all([
      this.prisma.enrollment.groupBy({ by: ["courseId"], where: inCourses, _count: { _all: true } }),
      this.prisma.lesson.groupBy({ by: ["courseId"], where: inCourses, _count: { _all: true } }),
      this.prisma.order.groupBy({ by: ["courseId"], where: { ...inCourses, status: PAID_ORDER_STATUS }, _sum: { totalAmount: true } }),
      this.prisma.courseReview.groupBy({ by: ["courseId"], where: { ...inCourses, status: APPROVED_REVIEW_STATUS }, _sum: { rating: true }, _count: { _all: true } }),
    ]);
    for (const e of enrollments) stats.get(e.courseId)!.students = e._count._all;
    for (const l of lessons) stats.get(l.courseId)!.lessons = l._count._all;
    for (const r of revenue) stats.get(r.courseId)!.revenue = Number(r._sum.totalAmount ?? 0);
    for (const r of reviews) Object.assign(stats.get(r.courseId)!, { ratingSum: r._sum.rating ?? 0, reviews: r._count._all });
    return stats;
  }

  /** Distinct students per instructor (a student in two of their courses counts once). */
  private async distinctStudents(instructorIds: string[]): Promise<Map<string, number>> {
    if (instructorIds.length === 0) return new Map();
    const rows = await this.prisma.$queryRaw<{ instructorId: string; n: number }[]>(Prisma.sql`
      SELECT c."instructorId" AS "instructorId", COUNT(DISTINCT e."userId")::int AS n
      FROM "Enrollment" e JOIN "Course" c ON c.id = e."courseId"
      WHERE c."instructorId" IN (${Prisma.join(instructorIds)})
      GROUP BY c."instructorId"`);
    return new Map(rows.map((r) => [r.instructorId, r.n]));
  }

  async summaries(instructorIds: string[]): Promise<Map<string, InstructorSummary>> {
    const result = new Map(instructorIds.map((id) => [id, emptySummary()]));
    if (instructorIds.length === 0) return result;

    const courses = await this.prisma.course.findMany({
      where: { instructorId: { in: instructorIds } },
      select: { id: true, instructorId: true, durationMinutes: true },
    });
    const [perCourse, students] = await Promise.all([this.courseStats(courses.map((c) => c.id)), this.distinctStudents(instructorIds)]);

    const ratingSums = new Map<string, number>();
    for (const c of courses) {
      const s = result.get(c.instructorId)!;
      const cs = perCourse.get(c.id)!;
      s.coursesCount++;
      s.teachingMinutes += c.durationMinutes;
      s.totalRevenue.amount += cs.revenue;
      s.reviewsCount += cs.reviews;
      ratingSums.set(c.instructorId, (ratingSums.get(c.instructorId) ?? 0) + cs.ratingSum);
    }
    for (const [id, s] of result) {
      s.studentsCount = students.get(id) ?? 0;
      s.totalRevenue.amount = round2(s.totalRevenue.amount);
      s.rating = s.reviewsCount ? round1((ratingSums.get(id) ?? 0) / s.reviewsCount) : 0;
    }
    return result;
  }

  /** Courses tab. */
  async courses(instructorId: string): Promise<InstructorCourseRow[]> {
    const courses = await this.prisma.course.findMany({
      where: { instructorId },
      orderBy: { title: "asc" },
      select: {
        id: true,
        title: true,
        shortDescription: true,
        slug: true,
        thumbnail: true,
        durationMinutes: true,
        price: true,
        isFree: true,
        status: true,
        category: { select: { name: true } },
      },
    });
    const stats = await this.courseStats(courses.map((c) => c.id));
    return courses.map((c) => {
      const s = stats.get(c.id)!;
      return {
        id: c.id,
        title: c.title,
        subtitle: c.shortDescription,
        slug: c.slug,
        thumbnailUrl: c.thumbnail,
        category: c.category.name,
        studentsCount: s.students,
        lessonsCount: s.lessons,
        durationMinutes: c.durationMinutes,
        price: Number(c.price),
        isFree: c.isFree,
        status: courseStatusLabel(c.status),
        rating: s.reviews ? round1(s.ratingSum / s.reviews) : 0,
        reviewsCount: s.reviews,
        revenue: { amount: round2(s.revenue), currency: DEFAULT_CURRENCY },
      };
    });
  }
}
