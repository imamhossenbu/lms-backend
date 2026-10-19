import {
  Controller,
  Post,
  Body,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { Roles } from "../../auth/decorators/roles.decorator";
import { AiService } from "./ai.service";
import {
  AskTutorDto,
  GenerateQuizDto,
  GenerateCourseOutlineDto,
  EvaluateAssignmentDto,
} from "./dto/ai.dto";

@Controller("ai")
@UseGuards(AuthGuard("jwt"))
export class AiController {
  constructor(private readonly aiService: AiService) {}

  /**
   * Ask the AI Tutor about any lesson or course topic
   */
  @Post("tutor-chat")
  async askTutor(@Body(new ValidationPipe({ transform: true })) dto: AskTutorDto) {
    return this.aiService.askTutor(dto);
  }

  /**
   * Auto-generate quiz questions with options and explanations
   */
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
