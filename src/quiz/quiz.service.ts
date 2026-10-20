import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class QuizService {
  constructor(private prisma: PrismaService) {}

  async createQuiz(data: any) {
    const { questions, ...quizData } = data;
    const totalMarks =
      quizData.totalMarks ??
      (Array.isArray(questions) && questions.length > 0
        ? questions.reduce((sum: number, q: any) => sum + (Number(q.marks) || 1), 0)
        : 10);

    const quiz = await this.prisma.quiz.create({
      data: {
        courseId: quizData.courseId || "",
        lessonId: quizData.lessonId || "",
        title: quizData.title || "Untitled Quiz",
        description: quizData.description || null,
        timeLimitMinutes: Number(quizData.timeLimitMinutes) || 15,
        passingScore: Number(quizData.passingScore) || Math.ceil(totalMarks * 0.7),
        totalMarks: Number(totalMarks),
        status: quizData.status || "ACTIVE",
      },
    });

    if (Array.isArray(questions) && questions.length > 0) {
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        await this.prisma.quizQuestion.create({
          data: {
            quizId: quiz.id,
            questionText: q.questionText || q.question || "Untitled Question",
            questionType: q.questionType || "MULTIPLE_CHOICE",
            options: JSON.stringify(q.options || []),
            correctAnswer: q.correctAnswer || "",
            marks: Number(q.marks) || 1,
            explanation: q.explanation || null,
            order: q.order ?? i + 1,
          },
        });
      }
    }

    return this.getQuiz(quiz.id);
  }

  async getQuiz(quizId: string, role?: string) {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id: quizId },
    });
    if (!quiz) throw new NotFoundException("Quiz not found");

    const rawQuestions = await this.prisma.quizQuestion.findMany({
      where: { quizId },
      orderBy: { order: "asc" },
    });

    const questions = rawQuestions.map((q) => {
      let parsedOptions: string[] = [];
      try {
        parsedOptions = typeof q.options === "string" ? JSON.parse(q.options) : q.options;
      } catch {
        parsedOptions = [q.options];
      }
      if (role === "STUDENT") {
        const { correctAnswer, ...rest } = q;
        return { ...rest, options: parsedOptions };
      }
      return { ...q, options: parsedOptions };
    });

    return { ...quiz, questions };
  }

  async getQuizByLesson(lessonId: string, role?: string) {
    const quiz = await this.prisma.quiz.findFirst({
      where: { lessonId },
    });
    if (!quiz) return null;
    return this.getQuiz(quiz.id, role);
  }

  async getQuizzesByCourse(courseId: string) {
    return await this.prisma.quiz.findMany({
      where: { courseId },
    });
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
    const { questions, ...quizData } = data;
    const existing = await this.prisma.quiz.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Quiz not found");

    let totalMarks = quizData.totalMarks;
    if (Array.isArray(questions)) {
      totalMarks = questions.reduce((sum: number, q: any) => sum + (Number(q.marks) || 1), 0);
    }

    await this.prisma.quiz.update({
      where: { id },
      data: {
        ...(quizData.title !== undefined ? { title: quizData.title } : {}),
        ...(quizData.description !== undefined ? { description: quizData.description } : {}),
        ...(quizData.timeLimitMinutes !== undefined ? { timeLimitMinutes: Number(quizData.timeLimitMinutes) } : {}),
        ...(quizData.passingScore !== undefined ? { passingScore: Number(quizData.passingScore) } : {}),
        ...(quizData.status !== undefined ? { status: quizData.status } : {}),
        ...(totalMarks !== undefined ? { totalMarks: Number(totalMarks) } : {}),
      },
    });

    if (Array.isArray(questions)) {
      await this.prisma.quizQuestion.deleteMany({ where: { quizId: id } });
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        await this.prisma.quizQuestion.create({
          data: {
            quizId: id,
            questionText: q.questionText || q.question || "Untitled Question",
            questionType: q.questionType || "MULTIPLE_CHOICE",
            options: JSON.stringify(q.options || []),
            correctAnswer: q.correctAnswer || "",
            marks: Number(q.marks) || 1,
            explanation: q.explanation || null,
            order: q.order ?? i + 1,
          },
        });
      }
    }

    return this.getQuiz(id);
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
