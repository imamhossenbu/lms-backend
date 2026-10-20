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

  @Get("lesson/:lessonId")
  @UseGuards(AuthGuard("jwt"))
  async getByLesson(@Req() req: any, @Param("lessonId") lessonId: string) {
    return this.quizService.getQuizByLesson(lessonId, req.user?.role);
  }

  @Get("course/:courseId")
  @UseGuards(AuthGuard("jwt"))
  async getByCourse(@Param("courseId") courseId: string) {
    return this.quizService.getQuizzesByCourse(courseId);
  }

  @Get(":quizId")
  @UseGuards(AuthGuard("jwt"))
  async getQuiz(@Req() req: any, @Param("quizId") quizId: string) {
    return this.quizService.getQuiz(quizId, req.user?.role);
  }

  @Patch(":quizId")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN", "TEACHER")
  async update(@Param("quizId") quizId: string, @Body() body: any) {
    return this.quizService.updateQuiz(quizId, body);
  }

  @Get(":quizId/my-attempts")
  @UseGuards(AuthGuard("jwt"))
  async getMyAttempts(@Req() req: any, @Param("quizId") quizId: string) {
    return this.quizService.getMyAttempts(req.user.userId, quizId);
  }

  @Get(":quizId/submissions")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN", "TEACHER")
  async getSubmissions(@Param("quizId") quizId: string) {
    return this.quizService.getQuizAttemptsForTeacher(quizId);
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
