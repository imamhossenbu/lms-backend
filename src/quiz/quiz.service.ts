import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class QuizService {
  constructor(private prisma: PrismaService) {}

  async createQuiz(data: any) {
    return await this.prisma.quiz.create({ data });
  }

  async getQuiz(quizId: string) {
    const quiz = await this.prisma.quiz.findUnique({ where: { id: quizId } });
    if (!quiz) throw new NotFoundException("Quiz not found");
    return quiz;
  }

  async updateQuiz(id: string, data: any) {
    return await this.prisma.quiz.update({ where: { id }, data });
  }

  async deleteQuiz(id: string) {
    await this.prisma.quizQuestion.deleteMany({ where: { quizId: id } });
    return await this.prisma.quiz.delete({ where: { id } });
  }

  async submitQuiz(userId: string, quizId: string, userAnswers: any[]) {
    const quiz = await this.prisma.quiz.findUnique({ where: { id: quizId } });
    if (!quiz) throw new NotFoundException("Quiz not found");

    const questions = await this.prisma.quizQuestion.findMany({
      where: { quizId },
    });
    let score = 0;
    let totalMarks = 0;

    questions.forEach((q) => {
      totalMarks += q.marks;
      const userAnswer = userAnswers.find((ans) => ans.questionId === q.id);
      if (userAnswer && userAnswer.answer === q.correctAnswer) {
        score += q.marks;
      }
    });

    const percentage = totalMarks > 0 ? (score / totalMarks) * 100 : 0;

    return await this.prisma.quizAttempt.create({
      data: {
        quizId,
        userId,
        answers: JSON.stringify(userAnswers),
        score,
        percentage: Number(percentage.toFixed(2)),
        parsed: true,
        submittedAt: new Date(),
      },
    });
  }
}
