import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AdminQuizzesController } from "./admin-quizzes.controller";
import { QuizAdminService } from "./services/quiz-admin.service";
import { QuizzesQueryService } from "./services/quizzes-query.service";

/** Admin panel › Quizzes (/admin/quizzes). Students take quizzes through the legacy QuizModule (/quiz). */
@Module({
  imports: [PrismaModule],
  controllers: [AdminQuizzesController],
  providers: [QuizzesQueryService, QuizAdminService],
})
export class QuizzesModule {}
