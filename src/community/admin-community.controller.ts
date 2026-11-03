import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser, RequireRoles, ValidateDto, type AuthUser } from "../common/auth-user";
import { RequirePermission } from "../team/permissions.guard";
import { AcceptReplyDto, CreateReplyDto, ReplyBodyDto, SetReplyRemovedDto } from "./dto/reply.dto";
import { ResolveReportDto } from "./dto/report.dto";
import { BulkFlagDto, BulkIdsDto, CreateThreadDto, SimilarQueryDto, ThreadFlagsDto, ThreadQueryDto, UpdateThreadDto } from "./dto/thread.dto";
import { CommunityAdminService } from "./services/community-admin.service";
import { CommunityQueryService } from "./services/community-query.service";

const Id = (name = "id") => Param(name, new ParseUUIDPipe({ errorHttpStatusCode: 404 }));

/** Admin panel › Community: discussions list + stats, thread page, form, moderation (pin / lock / hide, replies, reports). */
@ApiTags("Admin · Community")
@Controller("admin/community")
@RequireRoles("ADMIN")
@ValidateDto()
export class AdminCommunityController {
  constructor(
    private readonly query: CommunityQueryService,
    private readonly admin: CommunityAdminService,
  ) {}

  // ---------------------------------------------------------------- reads

  @Get("threads")
  @RequirePermission("community", "view")
  @ApiOperation({ summary: "Paginated discussions (ThreadView rows) for a tab + filters + sort, with per-tab counts" })
  list(@CurrentUser() user: AuthUser, @Query() q: ThreadQueryDto) {
    return this.query.list(user, q);
  }

  @Get("stats")
  @RequirePermission("community", "view")
  @ApiOperation({ summary: "Stat cards, health strip, top contributors, trending tags, category breakdown" })
  stats(@CurrentUser() user: AuthUser) {
    return this.query.stats(user);
  }

  @Get("moderation-queue")
  @RequirePermission("community", "view")
  @ApiOperation({ summary: "Open reports grouped by discussion, most reported first" })
  moderationQueue(@CurrentUser() user: AuthUser) {
    return this.query.moderationQueue(user);
  }

  @Get("similar")
  @RequirePermission("community", "view")
  @ApiOperation({ summary: "Form duplicate check: up to 3 same-course discussions with overlapping title words" })
  similar(@CurrentUser() user: AuthUser, @Query() q: SimilarQueryDto) {
    return this.query.similar(user, q);
  }

  @Get("threads/:id")
  @RequirePermission("community", "view")
  @ApiOperation({ summary: "Thread page bundle: thread, replies, reports" })
  detail(@CurrentUser() user: AuthUser, @Id() id: string) {
    return this.query.detail(user, id);
  }

  @Get("threads/:id/related")
  @RequirePermission("community", "view")
  @ApiOperation({ summary: "Similar Discussions sidebar: same course, shared tags first (max 4)" })
  related(@CurrentUser() user: AuthUser, @Id() id: string) {
    return this.query.related(user, id);
  }

  @Post("threads/:id/view")
  @HttpCode(200)
  @RequirePermission("community", "view")
  @ApiOperation({ summary: "Count a view (the panel calls it once per browser session)" })
  view(@CurrentUser() user: AuthUser, @Id() id: string) {
    return this.admin.recordView(user, id);
  }

  // ---------------------------------------------------------------- threads

  @Post("threads")
  @RequirePermission("community", "manage")
  @ApiOperation({ summary: "New Discussion form (posted as the signed-in admin)" })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateThreadDto) {
    return this.admin.create(user, dto);
  }

  @Patch("threads/:id")
  @RequirePermission("community", "manage")
  @ApiOperation({ summary: "Edit Discussion form (any subset of fields)" })
  update(@CurrentUser() user: AuthUser, @Id() id: string, @Body() dto: UpdateThreadDto) {
    return this.admin.update(user, id, dto);
  }

  @Patch("threads/:id/flags")
  @RequirePermission("community", "moderate")
  @ApiOperation({ summary: "Pin / lock / hide (any subset)" })
  setFlags(@CurrentUser() user: AuthUser, @Id() id: string, @Body() dto: ThreadFlagsDto) {
    return this.admin.setFlags(user, id, dto);
  }

  @Post("threads/bulk-flag")
  @HttpCode(200)
  @RequirePermission("community", "moderate")
  @ApiOperation({ summary: "Bulk pin / lock / hide; returns how many changed" })
  bulkFlag(@CurrentUser() user: AuthUser, @Body() dto: BulkFlagDto) {
    return this.admin.bulkFlag(user, dto);
  }

  @Post("threads/bulk-delete")
  @HttpCode(200)
  @RequirePermission("community", "delete")
  @ApiOperation({ summary: "Bulk delete discussions with their replies and reports" })
  bulkRemove(@CurrentUser() user: AuthUser, @Body() dto: BulkIdsDto) {
    return this.admin.bulkRemove(user, dto);
  }

  @Delete("threads/:id")
  @RequirePermission("community", "delete")
  @ApiOperation({ summary: "Delete the discussion, its replies and reports" })
  remove(@CurrentUser() user: AuthUser, @Id() id: string) {
    return this.admin.remove(user, id);
  }

  // ---------------------------------------------------------------- replies

  @Post("threads/:id/replies")
  @RequirePermission("community", "manage")
  @ApiOperation({ summary: "Reply as the signed-in admin (parentId = answer a reply; one nesting level)" })
  reply(@CurrentUser() user: AuthUser, @Id() id: string, @Body() dto: CreateReplyDto) {
    return this.admin.reply(user, id, dto);
  }

  @Put("threads/:id/accepted-reply")
  @RequirePermission("community", "moderate")
  @ApiOperation({ summary: "Mark (or clear with null) the accepted answer of a question; returns the thread's replies" })
  accept(@CurrentUser() user: AuthUser, @Id() id: string, @Body() dto: AcceptReplyDto) {
    return this.admin.accept(user, id, dto);
  }

  @Patch("replies/:replyId")
  @RequirePermission("community", "manage")
  @ApiOperation({ summary: "Edit your own reply" })
  editReply(@CurrentUser() user: AuthUser, @Id("replyId") replyId: string, @Body() dto: ReplyBodyDto) {
    return this.admin.editReply(user, replyId, dto);
  }

  @Patch("replies/:replyId/removed")
  @RequirePermission("community", "moderate")
  @ApiOperation({ summary: "Soft-remove (moderator notice) or restore a reply" })
  setReplyRemoved(@CurrentUser() user: AuthUser, @Id("replyId") replyId: string, @Body() dto: SetReplyRemovedDto) {
    return this.admin.setReplyRemoved(user, replyId, dto.removed);
  }

  @Delete("replies/:replyId")
  @RequirePermission("community", "delete")
  @ApiOperation({ summary: "Delete a reply (and its nested replies)" })
  removeReply(@CurrentUser() user: AuthUser, @Id("replyId") replyId: string) {
    return this.admin.removeReply(user, replyId);
  }

  // ---------------------------------------------------------------- reports

  @Post("reports/:reportId/resolve")
  @HttpCode(200)
  @RequirePermission("community", "moderate")
  @ApiOperation({ summary: "Dismiss / remove content / hide thread — resolves every open report on the same target" })
  resolveReport(@CurrentUser() user: AuthUser, @Id("reportId") reportId: string, @Body() dto: ResolveReportDto) {
    return this.admin.resolveReport(user, reportId, dto);
  }
}
