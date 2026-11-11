import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser, RequireRoles, ValidateDto, type AuthUser } from "../common/auth-user";
import { tenantOf } from "../common/tenancy";
import { ModuleTitleDto, RecordingDto, ReorderDto, TeacherLessonDto, TeacherLiveDto } from "./dto/teacher-content.dto";
import { TeacherContentService } from "./teacher-content.service";

/** Teacher mode › curriculum editing of own courses (modules + lessons) and scheduling own live classes. */
@ApiTags("Teacher")
@Controller("teacher")
@RequireRoles("TEACHER")
@ValidateDto()
export class TeacherContentController {
  constructor(private readonly content: TeacherContentService) {}

  // ---------------------------------------------------------------- modules
  @Post("courses/:courseId/modules")
  @ApiOperation({ summary: "Add a module at the end of the course" })
  addModule(@CurrentUser() u: AuthUser, @Param("courseId", ParseUUIDPipe) courseId: string, @Body() dto: ModuleTitleDto) {
    return this.content.addModule(u.userId, tenantOf(u), courseId, dto);
  }

  @Patch("courses/:courseId/modules/order")
  @HttpCode(200)
  reorderModules(@CurrentUser() u: AuthUser, @Param("courseId", ParseUUIDPipe) courseId: string, @Body() dto: ReorderDto) {
    return this.content.reorderModules(u.userId, tenantOf(u), courseId, dto);
  }

  @Patch("courses/:courseId/modules/:moduleId")
  renameModule(@CurrentUser() u: AuthUser, @Param("courseId", ParseUUIDPipe) courseId: string, @Param("moduleId", ParseUUIDPipe) moduleId: string, @Body() dto: ModuleTitleDto) {
    return this.content.renameModule(u.userId, tenantOf(u), courseId, moduleId, dto);
  }

  @Delete("courses/:courseId/modules/:moduleId")
  @ApiOperation({ summary: "Delete an empty module" })
  deleteModule(@CurrentUser() u: AuthUser, @Param("courseId", ParseUUIDPipe) courseId: string, @Param("moduleId", ParseUUIDPipe) moduleId: string) {
    return this.content.deleteModule(u.userId, tenantOf(u), courseId, moduleId);
  }

  @Patch("courses/:courseId/modules/:moduleId/lessons/order")
  @HttpCode(200)
  reorderLessons(@CurrentUser() u: AuthUser, @Param("courseId", ParseUUIDPipe) courseId: string, @Param("moduleId", ParseUUIDPipe) moduleId: string, @Body() dto: ReorderDto) {
    return this.content.reorderLessons(u.userId, tenantOf(u), courseId, moduleId, dto);
  }

  // ---------------------------------------------------------------- lessons
  @Get("courses/:courseId/lessons/:lessonId")
  lesson(@CurrentUser() u: AuthUser, @Param("courseId", ParseUUIDPipe) courseId: string, @Param("lessonId", ParseUUIDPipe) lessonId: string) {
    return this.content.lesson(u.userId, tenantOf(u), courseId, lessonId);
  }

  @Post("courses/:courseId/lessons")
  @ApiOperation({ summary: "Add a lesson to a module (HTML content is sanitised)" })
  addLesson(@CurrentUser() u: AuthUser, @Param("courseId", ParseUUIDPipe) courseId: string, @Body() dto: TeacherLessonDto) {
    return this.content.addLesson(u.userId, tenantOf(u), courseId, dto);
  }

  @Put("courses/:courseId/lessons/:lessonId")
  updateLesson(@CurrentUser() u: AuthUser, @Param("courseId", ParseUUIDPipe) courseId: string, @Param("lessonId", ParseUUIDPipe) lessonId: string, @Body() dto: TeacherLessonDto) {
    return this.content.updateLesson(u.userId, tenantOf(u), courseId, lessonId, dto);
  }

  @Delete("courses/:courseId/lessons/:lessonId")
  @ApiOperation({ summary: "Delete a lesson nobody has started (else set it to Draft)" })
  deleteLesson(@CurrentUser() u: AuthUser, @Param("courseId", ParseUUIDPipe) courseId: string, @Param("lessonId", ParseUUIDPipe) lessonId: string) {
    return this.content.deleteLesson(u.userId, tenantOf(u), courseId, lessonId);
  }

  // ---------------------------------------------------------------- live classes
  @Get("live-classes/:id")
  liveClass(@CurrentUser() u: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.content.liveClass(u.userId, tenantOf(u), id);
  }

  @Post("live-classes")
  @ApiOperation({ summary: "Schedule a live class for one of the teacher's courses" })
  scheduleLive(@CurrentUser() u: AuthUser, @Body() dto: TeacherLiveDto) {
    return this.content.scheduleLive(u.userId, tenantOf(u), dto);
  }

  @Put("live-classes/:id")
  updateLive(@CurrentUser() u: AuthUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: TeacherLiveDto) {
    return this.content.updateLive(u.userId, tenantOf(u), id, dto);
  }

  @Post("live-classes/:id/cancel")
  @HttpCode(200)
  cancelLive(@CurrentUser() u: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.content.cancelLive(u.userId, tenantOf(u), id);
  }

  @Patch("live-classes/:id/recording")
  setRecording(@CurrentUser() u: AuthUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: RecordingDto) {
    return this.content.setRecording(u.userId, tenantOf(u), id, dto.recordingUrl);
  }
}
