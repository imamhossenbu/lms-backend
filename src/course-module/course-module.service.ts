import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateModuleDto, UpdateModuleDto } from "./dto/module.dto";

@Injectable()
export class CourseModuleService {
  constructor(private prisma: PrismaService) {}

  async create(courseId: string, dto: CreateModuleDto) {
    return await this.prisma.courseModule.create({
      data: { ...dto, courseId },
    });
  }

  async findAllByCourse(courseId: string) {
    return await this.prisma.courseModule.findMany({
      where: { courseId },
      orderBy: { order: "asc" },
    });
  }

  async update(id: string, dto: UpdateModuleDto) {
    const module = await this.prisma.courseModule.findUnique({ where: { id } });
    if (!module) throw new NotFoundException("Module not found");
    return await this.prisma.courseModule.update({ where: { id }, data: dto });
  }

  async delete(id: string) {
    return await this.prisma.courseModule.delete({ where: { id } });
  }
}
