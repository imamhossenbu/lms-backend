import { Module } from "@nestjs/common";

import { PrismaModule } from "../prisma/prisma.module";
import { QuizController } from "./quiz.controller";
import { QuizService } from "./quiz.service";
import { QuizQuestionController } from "../quiz-question/quiz-question.controller";
import { QuizQuestionService } from "../quiz-question/quiz-question.service";

@Module({
  imports: [PrismaModule],
  controllers: [QuizController, QuizQuestionController],
  providers: [QuizService, QuizQuestionService],
  exports: [QuizService],
})
export class QuizModule {}
