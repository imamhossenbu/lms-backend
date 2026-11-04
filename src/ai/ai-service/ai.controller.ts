import {
  Controller,
  Post,
  Body,
  UseGuards,
  ValidationPipe,
  Res,
} from "@nestjs/common";
import { Response } from "express";
import { AuthGuard } from "@nestjs/passport";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { Roles } from "../../auth/decorators/roles.decorator";
import { AiService } from "./ai.service";
import { CurrentUser, type AuthUser } from "../../common/auth-user";
import { tenantOf } from "../../common/tenancy";
import { StaffPermission } from "../../team/permissions.guard";
import {
  AskTutorDto,
  GenerateQuizDto,
  GenerateCourseOutlineDto,
  EvaluateAssignmentDto,
  SummarizeLessonDto,
  GenerateFlashcardsDto,
} from "./dto/ai.dto";

@Controller("ai")
@UseGuards(AuthGuard("jwt"))
export class AiController {
  constructor(private readonly aiService: AiService) {}

  /**
   * Standard AI Tutor / Doubt Solver
   */
  @Post("tutor-chat")
  async askTutor(@Body(new ValidationPipe({ transform: true })) dto: AskTutorDto, @CurrentUser() user: AuthUser) {
    return this.aiService.askTutor(dto, tenantOf(user));
  }

  /**
   * Real-time Streaming AI Tutor Chat (SSE)
   */
  @Post("tutor-chat/stream")
  async streamTutorChat(
    @Body(new ValidationPipe({ transform: true })) dto: AskTutorDto,
    @Res() res: Response,
    @CurrentUser() user: AuthUser,
  ) {
    return this.aiService.streamTutorChat(dto, res, tenantOf(user));
  }

  /**
   * AI Lesson Summarizer & Key Notes Generator
   */
  @Post("summarize-lesson")
  async summarizeLesson(
    @Body(new ValidationPipe({ transform: true })) dto: SummarizeLessonDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.aiService.summarizeLesson(dto, tenantOf(user));
  }

  /**
   * AI Flashcards Generator for fast active recall
   */
  @Post("generate-flashcards")
  async generateFlashcards(
    @Body(new ValidationPipe({ transform: true })) dto: GenerateFlashcardsDto,
  ) {
    return this.aiService.generateFlashcards(dto);
  }

  /**
   * Auto-generate quiz questions with options and explanations
   */
  @StaffPermission("courses", "manage")
  @Post("generate-quiz")
  @UseGuards(RolesGuard)
  @Roles("TEACHER", "ADMIN")
  async generateQuiz(
    @Body(new ValidationPipe({ transform: true })) dto: GenerateQuizDto,
  ) {
    return this.aiService.generateQuiz(dto);
  }

  /**
   * Auto-generate full course syllabus with modules and lessons
   */
  @StaffPermission("courses", "manage")
  @Post("generate-course-outline")
  @UseGuards(RolesGuard)
  @Roles("TEACHER", "ADMIN")
  async generateCourseOutline(
    @Body(new ValidationPipe({ transform: true }))
    dto: GenerateCourseOutlineDto,
  ) {
    return this.aiService.generateCourseOutline(dto);
  }

  /**
   * Evaluate a student submission with automated grading and detailed feedback
   */
  @StaffPermission("courses", "manage")
  @Post("evaluate-assignment")
  @UseGuards(RolesGuard)
  @Roles("TEACHER", "ADMIN")
  async evaluateAssignment(
    @Body(new ValidationPipe({ transform: true }))
    dto: EvaluateAssignmentDto,
  ) {
    return this.aiService.evaluateAssignment(dto);
  }
}
