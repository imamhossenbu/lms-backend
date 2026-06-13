import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
} from "@nestjs/common";
import { QuizService } from "./quiz.service";
import { AuthGuard } from "@nestjs/passport";
import { Roles } from "../auth/decorators/roles.decorator";
import { RolesGuard } from "../auth/guards/roles.guard";

@Controller("quiz")
export class QuizController {
  constructor(private readonly quizService: QuizService) {}

  @Post()
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN", "TEACHER")
  async create(@Body() body: any) {
    return this.quizService.createQuiz(body);
  }

  @Post(":quizId/submit")
  @UseGuards(AuthGuard("jwt"))
  async submit(
    @Req() req: any,
    @Param("quizId") quizId: string,
    @Body("answers") answers: any[],
  ) {
    return this.quizService.submitQuiz(req.user.userId, quizId, answers);
  }

  @Delete(":quizId")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN", "TEACHER")
  async delete(@Param("quizId") quizId: string) {
    return this.quizService.deleteQuiz(quizId);
  }
}
