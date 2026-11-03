import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser, RequireRoles, ValidateDto, type AuthUser } from "../common/auth-user";
import { RequirePermission } from "../team/permissions.guard";
import { BroadcastQueryDto, DeliveryQueryDto, EstimateQueryDto, SaveBroadcastDto, TestBroadcastDto } from "./dto/broadcast.dto";
import { ArchiveDto, DeleteNotificationsDto, InboxQueryDto, MarkReadDto } from "./dto/inbox.dto";
import { SetTemplateEnabledDto, UpdateTemplateDto } from "./dto/template.dto";
import { BroadcastAdminService } from "./services/broadcast-admin.service";
import { BroadcastsQueryService } from "./services/broadcasts-query.service";
import { NotificationInboxService } from "./services/notification-inbox.service";
import { NotificationTemplatesService } from "./services/notification-templates.service";

const Id = () => Param("id", new ParseUUIDPipe({ errorHttpStatusCode: 404 }));

/** Admin panel › Notifications: the admin's own Inbox, Broadcasts (compose / schedule / analytics) and automated Templates. */
@ApiTags("Admin · Notifications")
@Controller("admin/notifications")
@RequireRoles("ADMIN")
@ValidateDto()
export class AdminNotificationsController {
  constructor(
    private readonly inbox: NotificationInboxService,
    private readonly broadcasts: BroadcastsQueryService,
    private readonly broadcastAdmin: BroadcastAdminService,
    private readonly templates: NotificationTemplatesService,
  ) {}

  @Get("stats")
  @RequirePermission("notifications", "view")
  @ApiOperation({ summary: "Header numbers: inbox counters, broadcast overview, template counts" })
  async stats(@CurrentUser() user: AuthUser) {
    const [inbox, broadcasts, templates] = await Promise.all([this.inbox.stats(user.userId), this.broadcasts.overview(user), this.templates.list(user)]);
    return { inbox, broadcasts, templates: { total: templates.length, enabled: templates.filter((t) => t.enabled).length } };
  }

  // ---------------------------------------------------------------- inbox (the signed-in admin's own notifications)

  @Get("inbox")
  @RequirePermission("notifications", "view")
  @ApiOperation({ summary: "Paginated inbox feed: status (all / unread / archived), category, HIGH priority, search" })
  listInbox(@CurrentUser() user: AuthUser, @Query() q: InboxQueryDto) {
    return this.inbox.list(user.userId, q);
  }

  @Get("inbox/stats")
  @RequirePermission("notifications", "view")
  @ApiOperation({ summary: "Inbox counters + unread per category (filter rail)" })
  inboxStats(@CurrentUser() user: AuthUser) {
    return this.inbox.stats(user.userId);
  }

  @Get("inbox/unread-count")
  @RequirePermission("notifications", "view")
  @ApiOperation({ summary: "Sidebar badge / navbar dot" })
  unreadCount(@CurrentUser() user: AuthUser) {
    return this.inbox.unreadCount(user.userId);
  }

  @Patch("inbox/read")
  @RequirePermission("notifications", "view")
  @ApiOperation({ summary: 'Mark ids (or "all") read / unread' })
  markRead(@CurrentUser() user: AuthUser, @Body() dto: MarkReadDto) {
    return this.inbox.markRead(user.userId, dto.ids, dto.isRead);
  }

  @Patch("inbox/archive")
  @RequirePermission("notifications", "view")
  @ApiOperation({ summary: "Archive / unarchive (archiving also marks read)" })
  archive(@CurrentUser() user: AuthUser, @Body() dto: ArchiveDto) {
    return this.inbox.archive(user.userId, dto.ids, dto.isArchived);
  }

  @Post("inbox/delete")
  @HttpCode(200)
  @RequirePermission("notifications", "delete")
  @ApiOperation({ summary: "Delete inbox notifications" })
  deleteInbox(@CurrentUser() user: AuthUser, @Body() dto: DeleteNotificationsDto) {
    return this.inbox.remove(user.userId, dto.ids);
  }

  @Post("inbox/:id/click")
  @HttpCode(200)
  @RequirePermission("notifications", "view")
  @ApiOperation({ summary: "Open a notification: marks it read and returns its link" })
  click(@CurrentUser() user: AuthUser, @Id() id: string) {
    return this.inbox.click(user.userId, id);
  }

  // ---------------------------------------------------------------- broadcasts

  @Get("broadcasts")
  @RequirePermission("notifications", "view")
  @ApiOperation({ summary: "Paginated broadcasts (search, status, audience, channel) with recipients + open rate per row" })
  listBroadcasts(@CurrentUser() user: AuthUser, @Query() q: BroadcastQueryDto) {
    return this.broadcasts.list(user, q);
  }

  @Get("broadcasts/overview")
  @RequirePermission("notifications", "view")
  @ApiOperation({ summary: "Overview cards: sent (30 days), scheduled, drafts, avg open / click rate, students reached" })
  overview(@CurrentUser() user: AuthUser) {
    return this.broadcasts.overview(user);
  }

  @Get("broadcasts/estimate")
  @RequirePermission("notifications", "view")
  @ApiOperation({ summary: "Live recipient count for an audience (compose page)" })
  estimate(@CurrentUser() user: AuthUser, @Query() q: EstimateQueryDto) {
    return this.broadcasts.estimate(user, q);
  }

  @Post("broadcasts/test")
  @HttpCode(200)
  @RequirePermission("notifications", "manage")
  @ApiOperation({ summary: "Email the composed broadcast to the signed-in admin" })
  testBroadcast(@CurrentUser() user: AuthUser, @Body() dto: TestBroadcastDto) {
    return this.broadcastAdmin.sendTest(user, dto);
  }

  @Get("broadcasts/:id")
  @RequirePermission("notifications", "view")
  @ApiOperation({ summary: "Broadcast + delivery funnel, per-channel breakdown and opens timeline" })
  broadcastDetail(@CurrentUser() user: AuthUser, @Id() id: string) {
    return this.broadcasts.detail(user, id);
  }

  @Get("broadcasts/:id/deliveries")
  @RequirePermission("notifications", "view")
  @ApiOperation({ summary: "Recipients table: one row per recipient × channel (search, channel, status)" })
  deliveries(@CurrentUser() user: AuthUser, @Id() id: string, @Query() q: DeliveryQueryDto) {
    return this.broadcasts.deliveries(user, id, q);
  }

  @Post("broadcasts")
  @RequirePermission("notifications", "manage")
  @ApiOperation({ summary: "Send now, schedule (timing: SCHEDULE) or save as draft (asDraft: true)" })
  createBroadcast(@CurrentUser() user: AuthUser, @Body() dto: SaveBroadcastDto) {
    return this.broadcastAdmin.create(user, dto);
  }

  @Patch("broadcasts/:id")
  @RequirePermission("notifications", "manage")
  @ApiOperation({ summary: "Edit a draft / scheduled broadcast (full form); may send it now or reschedule" })
  updateBroadcast(@CurrentUser() user: AuthUser, @Id() id: string, @Body() dto: SaveBroadcastDto) {
    return this.broadcastAdmin.update(user, id, dto);
  }

  @Post("broadcasts/:id/cancel")
  @HttpCode(200)
  @RequirePermission("notifications", "manage")
  cancel(@CurrentUser() user: AuthUser, @Id() id: string) {
    return this.broadcastAdmin.cancel(user, id);
  }

  @Post("broadcasts/:id/duplicate")
  @RequirePermission("notifications", "manage")
  @ApiOperation({ summary: "Copy as a draft (resend = duplicate, then send)" })
  duplicate(@CurrentUser() user: AuthUser, @Id() id: string) {
    return this.broadcastAdmin.duplicate(user, id);
  }

  @Post("broadcasts/:id/retry")
  @HttpCode(200)
  @RequirePermission("notifications", "manage")
  @ApiOperation({ summary: "Retry failed email deliveries; returns how many went through" })
  retry(@CurrentUser() user: AuthUser, @Id() id: string) {
    return this.broadcastAdmin.retryFailed(user, id);
  }

  @Delete("broadcasts/:id")
  @RequirePermission("notifications", "delete")
  @ApiOperation({ summary: "Delete a draft / scheduled / cancelled broadcast (sent ones are kept)" })
  removeBroadcast(@CurrentUser() user: AuthUser, @Id() id: string) {
    return this.broadcastAdmin.remove(user, id);
  }

  // ---------------------------------------------------------------- automated templates

  @Get("templates")
  @RequirePermission("notifications", "view")
  @ApiOperation({ summary: "One template per trigger, with sends in the last 30 days" })
  listTemplates(@CurrentUser() user: AuthUser) {
    return this.templates.list(user);
  }

  @Get("templates/:id")
  @RequirePermission("notifications", "view")
  templateDetail(@CurrentUser() user: AuthUser, @Id() id: string) {
    return this.templates.detail(user, id);
  }

  @Patch("templates/:id")
  @RequirePermission("notifications", "manage")
  @ApiOperation({ summary: "Edit name / subject / body / channels / enabled (placeholders checked per trigger)" })
  updateTemplate(@CurrentUser() user: AuthUser, @Id() id: string, @Body() dto: UpdateTemplateDto) {
    return this.templates.update(user, id, dto);
  }

  @Patch("templates/:id/enabled")
  @RequirePermission("notifications", "manage")
  setEnabled(@CurrentUser() user: AuthUser, @Id() id: string, @Body() dto: SetTemplateEnabledDto) {
    return this.templates.setEnabled(user, id, dto.enabled);
  }

  @Post("templates/:id/test")
  @HttpCode(200)
  @RequirePermission("notifications", "manage")
  @ApiOperation({ summary: "Email the template (sample values) to the signed-in admin" })
  testTemplate(@CurrentUser() user: AuthUser, @Id() id: string) {
    return this.templates.sendTest(user, id);
  }
}
