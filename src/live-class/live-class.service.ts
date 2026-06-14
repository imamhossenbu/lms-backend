import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateLiveClassDto, UpdateLiveClassDto } from "./dto/live-class.dto";

@Injectable()
export class LiveClassService {
  constructor(private prisma: PrismaService) {}

  async create(instructorId: string, data: CreateLiveClassDto) {
    return await this.prisma.liveClass.create({
      data: { ...data, instructorId, status: "SCHEDULED" },
    });
  }

  async findAll() {
    return await this.prisma.liveClass.findMany({
      orderBy: { startTime: "desc" },
    });
  }

  async getAllByCourse(courseId: string) {
    return await this.prisma.liveClass.findMany({
      where: { courseId },
      orderBy: { startTime: "asc" },
    });
  }

  async update(id: string, data: UpdateLiveClassDto) {
    const liveClass = await this.prisma.liveClass.findUnique({ where: { id } });
    if (!liveClass) throw new NotFoundException("Class not found");
    return await this.prisma.liveClass.update({ where: { id }, data });
  }

  async delete(id: string) {
    const liveClass = await this.prisma.liveClass.findUnique({ where: { id } });
    if (!liveClass) throw new NotFoundException("Class not found");
    return await this.prisma.liveClass.delete({ where: { id } });
  }
}
