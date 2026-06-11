import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateLessonDto, UpdateLessonDto } from "./dto/lesson.dto";

@Injectable()
export class LessonService {
  constructor(private prisma: PrismaService) {}

  async create(courseId: string, moduleId: string, dto: CreateLessonDto) {
    return await this.prisma.lesson.create({
      data: { ...dto, courseId, moduleId, status: dto.status || "DRAFT" },
    });
  }

  async findAllByModule(moduleId: string) {
    return await this.prisma.lesson.findMany({
      where: { moduleId },
      orderBy: { order: "asc" },
    });
  }

  async update(id: string, dto: UpdateLessonDto) {
    return await this.prisma.lesson.update({ where: { id }, data: dto });
  }

  async delete(id: string) {
    return await this.prisma.lesson.delete({ where: { id } });
  }
}
