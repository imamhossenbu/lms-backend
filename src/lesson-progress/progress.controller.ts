// src/lesson-progress/progress.controller.ts
import { Controller, Patch, Param, Body, UseGuards, Req } from "@nestjs/common";
import { LessonProgressService } from "./lesson-progress.service";
import { AuthGuard } from "@nestjs/passport";

@Controller("progress")
@UseGuards(AuthGuard("jwt"))
export class ProgressController {
  constructor(private readonly progressService: LessonProgressService) {}

  @Patch(":lessonId/video")
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
  async complete(@Req() req: any, @Param("lessonId") lessonId: string) {
    return this.progressService.markAsCompleted(req.user.userId, lessonId);
  }
}
