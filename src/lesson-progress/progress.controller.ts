import {
  Controller,
  Patch,
  Param,
  Body,
  UseGuards,
  Req,
  Get,
} from "@nestjs/common";
import { LessonProgressService } from "./lesson-progress.service";
import { AuthGuard } from "@nestjs/passport";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";

@ApiTags("Lesson Progress")
@ApiBearerAuth()
@Controller("progress")
@UseGuards(AuthGuard("jwt"))
export class ProgressController {
  constructor(private readonly progressService: LessonProgressService) {}

  @Get("course/:courseId")
  @ApiOperation({ summary: "Get student's completed lessons and progress map for a course" })
  async getCourseProgress(
    @Req() req: any,
    @Param("courseId") courseId: string,
  ) {
    return this.progressService.getCourseProgress(req.user.userId, courseId);
  }

  @Patch(":lessonId/video")
  @ApiOperation({ summary: "Update watched duration of a video lesson" })
  async updateVideo(
    @Req() req: any,
    @Param("lessonId") lessonId: string,
    @Body("minutes") minutes: number,
  ) {
    return this.progressService.updateVideoProgress(
      req.user.userId,
      lessonId,
      minutes,
    );
  }

  @Patch(":lessonId/complete")
  @ApiOperation({ summary: "Mark a lesson as 100% completed" })
  async complete(@Req() req: any, @Param("lessonId") lessonId: string) {
    return this.progressService.markAsCompleted(req.user.userId, lessonId);
  }
}
