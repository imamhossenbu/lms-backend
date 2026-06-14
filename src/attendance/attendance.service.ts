import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AttendanceService {
  constructor(private prisma: PrismaService) {}

  async checkIn(userId: string, liveClassId: string) {
    return await this.prisma.attendance.create({
      data: {
        liveClassId,
        userId,
        joinedAt: new Date(),
        durationMinutes: 0,
        status: "ACTIVE",
      },
    });
  }

  async ping(id: string) {
    const record = await this.prisma.attendance.findUnique({ where: { id } });
    if (!record || record.status === "SUSPENDED") return;

    return await this.prisma.attendance.update({
      where: { id },
      data: { durationMinutes: { increment: 1 } },
    });
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
