import {
  Controller,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Get,
} from "@nestjs/common";
import { QuizQuestionService } from "./quiz-question.service";
import { AuthGuard } from "@nestjs/passport";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
@Controller("quiz") // বেস পাথ হবে 'quiz'
@UseGuards(AuthGuard("jwt"), RolesGuard)
export class QuizQuestionController {
  constructor(private readonly questionService: QuizQuestionService) {}

  // POST /quiz/:quizId/questions
  @Post(":quizId/questions")
  @Roles("ADMIN", "TEACHER")
  async create(@Param("quizId") quizId: string, @Body() dto: any) {
    return this.questionService.create(quizId, dto);
  }

  // GET /quiz/:quizId/questions
  @Get(":quizId/questions")
  async findAll(@Param("quizId") quizId: string) {
    return this.questionService.findAll(quizId);
  }

  @Patch("questions/:questionId") // Path: /quiz/questions/:questionId
  @Roles("ADMIN", "TEACHER")
  async update(@Param("questionId") questionId: string, @Body() dto: any) {
    return this.questionService.update(questionId, dto);
  }

  @Delete("questions/:questionId") // Path: /quiz/questions/:questionId
  @Roles("ADMIN", "TEACHER")
  async delete(@Param("questionId") questionId: string) {
    return this.questionService.delete(questionId);
  }
}
