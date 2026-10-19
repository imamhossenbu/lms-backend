import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class QuizService {
  constructor(private prisma: PrismaService) {}

  async createQuiz(data: any) {
    return await this.prisma.quiz.create({ data });
  }

  async getQuiz(quizId: string, role?: string) {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id: quizId },
    });
    if (!quiz) throw new NotFoundException("Quiz not found");

    const questions = await this.prisma.quizQuestion.findMany({
      where: { quizId },
      orderBy: { order: "asc" },
    });

    // Hide correctAnswer from students so they cannot inspect answers before submitting
    if (role === "STUDENT") {
      const sanitizedQuestions = questions.map((q) => {
        const { correctAnswer, ...rest } = q;
        return rest;
      });
      return { ...quiz, questions: sanitizedQuestions };
    }

    return { ...quiz, questions };
  }

  async getMyAttempts(userId: string, quizId?: string) {
    return await this.prisma.quizAttempt.findMany({
      where: {
        userId,
        ...(quizId && { quizId }),
      },
      orderBy: { submittedAt: "desc" },
    });
  }

  async getQuizAttemptsForTeacher(quizId: string) {
    const attempts = await this.prisma.quizAttempt.findMany({
      where: { quizId },
      orderBy: { submittedAt: "desc" },
    });

    const userIds = attempts.map((a) => a.userId);
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
      },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    return attempts.map((attempt) => ({
      ...attempt,
      user: userMap.get(attempt.userId) || null,
    }));
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
