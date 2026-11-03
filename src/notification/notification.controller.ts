import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser, RequireRoles, ValidateDto, type AuthUser } from "../common/auth-user";
import { InboxQueryDto, MarkReadDto } from "../notifications/dto/inbox.dto";
import { NotificationInboxService } from "../notifications/services/notification-inbox.service";

const Id = () => Param("id", new ParseUUIDPipe({ errorHttpStatusCode: 404 }));

/**
 * The signed-in user's own notifications (students, instructors, staff). Admins manage broadcasts and
 * templates at /admin/notifications.
 */
@ApiTags("Notifications (me)")
@Controller("notification")
@RequireRoles("STUDENT", "TEACHER", "ADMIN")
@ValidateDto()
export class NotificationController {
  constructor(private readonly inbox: NotificationInboxService) {}

  @Get()
  @ApiOperation({ summary: "My notifications, newest first (status all / unread / archived, category, search)" })
  list(@CurrentUser() user: AuthUser, @Query() q: InboxQueryDto) {
    return this.inbox.list(user.userId, q);
  }

  @Get("unread-count")
  unreadCount(@CurrentUser() user: AuthUser) {
    return this.inbox.unreadCount(user.userId);
  }

  @Patch("read-all")
  markAllAsRead(@CurrentUser() user: AuthUser) {
    return this.inbox.markRead(user.userId, "all");
  }

  @Patch("read")
  @ApiOperation({ summary: 'Mark ids (or "all") read / unread' })
  markRead(@CurrentUser() user: AuthUser, @Body() dto: MarkReadDto) {
    return this.inbox.markRead(user.userId, dto.ids, dto.isRead);
  }

  @Patch(":id/read")
  markAsRead(@CurrentUser() user: AuthUser, @Id() id: string) {
    return this.inbox.markOneRead(user.userId, id);
  }

  @Post(":id/click")
  @HttpCode(200)
  @ApiOperation({ summary: "Open a notification: marks it read and returns its link" })
  click(@CurrentUser() user: AuthUser, @Id() id: string) {
    return this.inbox.click(user.userId, id);
  }

  @Delete(":id")
  remove(@CurrentUser() user: AuthUser, @Id() id: string) {
    return this.inbox.removeOne(user.userId, id);
  }
}
