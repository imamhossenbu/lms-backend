import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class DurationService {
  constructor(private prisma: PrismaService) {}

  async updateDurations(courseId: string, moduleId: string) {
    const lessons = await this.prisma.lesson.findMany({ where: { moduleId } });
    const moduleTotal = lessons.reduce((sum, l) => sum + l.durationMinutes, 0);

    await this.prisma.courseModule.update({
      where: { id: moduleId },
      data: { durationMinutes: moduleTotal },
    });

    const allModules = await this.prisma.courseModule.findMany({
      where: { courseId },
    });
    const courseTotal = allModules.reduce(
      (sum, m) => sum + m.durationMinutes,
      0,
    );

    await this.prisma.course.update({
      where: { id: courseId },
      data: { durationMinutes: courseTotal },
    });
  }
}
