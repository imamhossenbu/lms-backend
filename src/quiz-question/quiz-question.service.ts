import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class QuizQuestionService {
  constructor(private prisma: PrismaService) {}

  async create(quizId: string, dto: any) {
    return await this.prisma.quizQuestion.create({
      data: {
        quizId,
        ...dto,
        options: JSON.stringify(dto.options),
      },
    });
  }

  async findAll(quizId: string) {
    return await this.prisma.quizQuestion.findMany({
      where: { quizId },
      orderBy: { order: "asc" },
    });
  }

  async update(id: string, dto: any) {
    return await this.prisma.quizQuestion.update({
      where: { id },
      data: {
        ...dto,
        options: dto.options ? JSON.stringify(dto.options) : undefined,
      },
    });
  }

  async delete(id: string) {
    return await this.prisma.quizQuestion.delete({ where: { id } });
  }
}
