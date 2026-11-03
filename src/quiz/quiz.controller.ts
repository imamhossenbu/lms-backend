import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser, RequireRoles, ValidateDto, type AuthUser } from "../common/auth-user";
import { SubmitQuizDto } from "../quizzes/dto/attempt.dto";
import { QuizService } from "./quiz.service";

const Id = (name: string) => Param(name, new ParseUUIDPipe({ errorHttpStatusCode: 404 }));

/** Student side of quizzes: list open quizzes, take one (no answers leaked), submit, see own attempts. */
@ApiTags("Quizzes (student)")
@Controller("quiz")
@RequireRoles("STUDENT", "ADMIN")
@ValidateDto()
export class QuizController {
  constructor(private readonly service: QuizService) {}

  @Get("course/:courseId")
  @ApiOperation({ summary: "Open, published quizzes of a course" })
  byCourse(@CurrentUser() user: AuthUser, @Id("courseId") courseId: string) {
    return this.service.listForCourse(user, courseId);
  }

  @Get("lesson/:lessonId")
  byLesson(@CurrentUser() user: AuthUser, @Id("lessonId") lessonId: string) {
    return this.service.forLesson(user, lessonId);
  }

  @Get(":quizId")
  @ApiOperation({ summary: "Quiz to take: questions without answers, shuffled when the quiz says so" })
  take(@CurrentUser() user: AuthUser, @Id("quizId") quizId: string) {
    return this.service.take(user, quizId);
  }

  @Get(":quizId/my-attempts")
  myAttempts(@CurrentUser() user: AuthUser, @Id("quizId") quizId: string) {
    return this.service.myAttempts(user, quizId);
  }

  @Post(":quizId/submit")
  @ApiOperation({ summary: "Submit answers; graded on the server" })
  submit(@CurrentUser() user: AuthUser, @Id("quizId") quizId: string, @Body() dto: SubmitQuizDto) {
    return this.service.submit(user, quizId, dto);
  }
}
