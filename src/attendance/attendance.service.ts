import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AttendanceService {
  constructor(private prisma: PrismaService) {}

  async checkIn(userId: string, liveClassId: string) {
    const liveClass = await this.prisma.liveClass.findUnique({
      where: { id: liveClassId },
      select: { id: true, courseId: true, endTime: true, startTime: true },
    });

    if (!liveClass) {
      throw new NotFoundException("Live class not found.");
    }

    const currentTime = new Date().getTime();

    const startTime = new Date(liveClass.startTime).getTime();
    const endTime = new Date(liveClass.endTime).getTime();

    if (currentTime < startTime) {
      throw new BadRequestException("This class has not started yet.");
    }

    if (currentTime > endTime) {
      throw new BadRequestException("This class has already ended.");
    }

    const enrollment = await this.prisma.enrollment.findFirst({
      where: {
        userId,
        courseId: liveClass.courseId,
        status: "ACTIVE",
      },
    });

    if (!enrollment) {
      throw new BadRequestException("You are not enrolled in this course.");
    }

    return await this.prisma.attendance.upsert({
      where: {
        userId_liveClassId: {
          userId,
          liveClassId,
        },
      },
      create: {
        liveClassId,
        userId,
        joinedAt: new Date(),
        durationMinutes: 0,
        status: "ACTIVE",
      },
      update: {},
    });
  }

  async ping(id: string) {
    try {
      const record = await this.prisma.attendance.findUnique({
        where: { id },
      });

      if (!record || record.status === "SUSPENDED") {
        return { message: "Attendance inactive or suspended" };
      }

      return await this.prisma.attendance.update({
        where: { id },
        data: { durationMinutes: { increment: 1 } },
      });
    } catch (error) {
      console.error("Database connection error:", error);
      throw new Error("Database connection lost. Please try again.");
    }
  }

  async updateStatus(id: string, status: "ACTIVE" | "SUSPENDED") {
    return await this.prisma.attendance.update({
      where: { id },
      data: { status },
    });
  }

  async checkOut(id: string) {
    return await this.prisma.attendance.update({
      where: { id },
      data: { leftAt: new Date(), status: "COMPLETED" },
    });
  }

  async getByLiveClassId(liveClassId: string) {
    return await this.prisma.attendance.findMany({
      where: { liveClassId },
      include: {
        user: true,
      },
      orderBy: { joinedAt: "desc" },
    });
  }

  async updateDuration(id: string, minutes: number) {
    return await this.prisma.attendance.update({
      where: { id },
      data: { durationMinutes: minutes },
    });
  }

  async remove(id: string) {
    return await this.prisma.attendance.delete({ where: { id } });
  }
}
