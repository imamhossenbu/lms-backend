import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class ReviewService {
  constructor(private prisma: PrismaService) {}

  async createReview(
    userId: string,
    data: { courseId: string; rating: number; reviewText?: string },
  ) {
    // 1. Verify that the student is actually enrolled in this course
    const enrollment = await this.prisma.enrollment.findFirst({
      where: { userId, courseId: data.courseId, status: "ACTIVE" },
    });

    if (!enrollment) {
      throw new ForbiddenException(
        "Only enrolled students are allowed to leave a review for this course.",
      );
    }

    // 2. Check for duplicate review
    const existing = await this.prisma.courseReview.findFirst({
      where: { userId, courseId: data.courseId },
    });

    if (existing) {
      throw new BadRequestException("You have already reviewed this course.");
    }

    return await this.prisma.courseReview.create({
      data: { ...data, userId, status: "PENDING" },
    });
  }

  async getReviewsByCourse(courseId: string) {
    return await this.prisma.courseReview.findMany({
      where: { courseId, status: "APPROVED" },
      orderBy: { createdAt: "desc" },
    });
  }

  async updateReview(
    id: string,
    userId: string,
    data: { rating: number; reviewText?: string },
  ) {
    const review = await this.prisma.courseReview.findUnique({ where: { id } });

    if (!review) throw new NotFoundException("Review not found");
    if (review.userId !== userId) throw new ForbiddenException("Unauthorized");

    return await this.prisma.courseReview.update({
      where: { id },
      data: { ...data, status: "PENDING" },
    });
  }

  async deleteReview(id: string, userId: string, userRole: string) {
    const review = await this.prisma.courseReview.findUnique({ where: { id } });

    if (!review) throw new NotFoundException("Review not found");

    const isOwner = review.userId === userId;
    const isAdmin = userRole === "ADMIN";

    if (!isOwner && !isAdmin) {
      throw new ForbiddenException("Unauthorized");
    }

    const deleted = await this.prisma.courseReview.delete({ where: { id } });
    await this.recalculateCourseRating(deleted.courseId);
    return deleted;
  }

  async updateStatus(id: string, status: "APPROVED" | "REJECTED") {
    const updated = await this.prisma.courseReview.update({
      where: { id },
      data: { status },
    });

    await this.recalculateCourseRating(updated.courseId);
    return updated;
  }

  /**
   * Recalculates and updates the Course.ratingAverage based on all APPROVED reviews
   */
  private async recalculateCourseRating(courseId: string) {
    try {
      const agg = await this.prisma.courseReview.aggregate({
        where: { courseId, status: "APPROVED" },
        _avg: { rating: true },
      });

      const avgRating = agg._avg.rating ? Number(agg._avg.rating.toFixed(1)) : 0;

      await this.prisma.course.update({
        where: { id: courseId },
        data: { ratingAverage: avgRating },
      });
    } catch (err) {
      console.error("Failed to recalculate course rating:", err);
    }
  }

  async getReviewsByUser(userId: string) {
    return await this.prisma.courseReview.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: {
        course: true,
      },
    });
  }

  async getAllReviews() {
    return await this.prisma.courseReview.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        course: true,
      },
    });
  }
}
