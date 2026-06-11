import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateLessonResourceDto } from "./dto/resource.dto";

@Injectable()
export class LessonResourceService {
  constructor(private prisma: PrismaService) {}

  async create(lessonId: string, dto: CreateLessonResourceDto) {
    return await this.prisma.lessonResource.create({
      data: { ...dto, lessonId },
    });
  }

  async findAllByLesson(lessonId: string) {
    return await this.prisma.lessonResource.findMany({
      where: { lessonId },
    });
  }

  async delete(id: string) {
    return await this.prisma.lessonResource.delete({ where: { id } });
  }
}
