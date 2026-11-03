import { Controller, Get, Param, ParseUUIDPipe } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser, RequireRoles, type AuthUser } from "../common/auth-user";
import { AnnouncementService } from "./announcement.service";

/**
 * Read-only course announcements for enrolled students (and staff). Admins create them as broadcasts
 * at /admin/notifications/broadcasts (audience COURSE).
 */
@ApiTags("Announcements (student)")
@Controller("announcement")
@RequireRoles("STUDENT", "TEACHER", "ADMIN")
export class AnnouncementController {
  constructor(private readonly announcementService: AnnouncementService) {}

  @Get(":courseId")
  @ApiOperation({ summary: "Sent broadcasts that targeted this course, newest first" })
  getByCourse(@CurrentUser() user: AuthUser, @Param("courseId", new ParseUUIDPipe({ errorHttpStatusCode: 404 })) courseId: string) {
    return this.announcementService.getAllByCourse(user, courseId);
  }
}
