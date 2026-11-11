import { Body, Controller, createParamDecorator, Delete, ExecutionContext, Get, HttpCode, Param, ParseUUIDPipe, Patch, Query, Res } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { RequireRoles, ValidateDto } from "../../common/auth-user";
import { RequirePermission } from "../../team/permissions.guard";
import type { ActorContext } from "../../team/services/team-access.service";
import { AdminWebsiteService } from "./admin-website.service";
import { MessageQueryDto, MessageStatusDto, SubscriberQueryDto, SubscriberStatusDto, UpdateWebsiteDto } from "./website.dto";

const Actor = createParamDecorator((_: unknown, ctx: ExecutionContext): ActorContext => ctx.switchToHttp().getRequest().teamAccess);

/** Admin panel › Website: academy site content + newsletter subscribers (Settings permission). */
@ApiTags("Admin · Website")
@Controller("admin/website")
@RequireRoles("ADMIN")
@ValidateDto()
export class AdminWebsiteController {
  constructor(private readonly website: AdminWebsiteService) {}

  @Get()
  @RequirePermission("settings", "view")
  @ApiOperation({ summary: "Website content (normalised), the site's public URL and last saved time" })
  get(@Actor() ctx: ActorContext) {
    return this.website.get(ctx.tenantId);
  }

  @Patch()
  @RequirePermission("settings", "manage")
  @ApiOperation({ summary: "Save the website content (hero, mission, app, FAQ, socials, newsletter copy) — saved whole" })
  update(@Actor() ctx: ActorContext, @Body() dto: UpdateWebsiteDto) {
    return this.website.update(ctx.tenantId, dto);
  }

  @Get("subscribers")
  @RequirePermission("settings", "view")
  @ApiOperation({ summary: "Newsletter subscribers (search, status, paging) + stats" })
  subscribers(@Actor() ctx: ActorContext, @Query() q: SubscriberQueryDto) {
    return this.website.subscribers(ctx.tenantId, q);
  }

  @Get("subscribers/export")
  @RequirePermission("settings", "view")
  @ApiOperation({ summary: "CSV of the matching subscribers" })
  async export(@Actor() ctx: ActorContext, @Query() q: SubscriberQueryDto, @Res() res: Response) {
    const csv = await this.website.exportCsv(ctx.tenantId, q);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="newsletter-subscribers-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send("﻿" + csv);
  }

  @Patch("subscribers/:id")
  @RequirePermission("settings", "manage")
  @ApiOperation({ summary: "Unsubscribe / re-subscribe" })
  setStatus(@Actor() ctx: ActorContext, @Param("id", ParseUUIDPipe) id: string, @Body() dto: SubscriberStatusDto) {
    return this.website.setStatus(ctx.tenantId, id, dto.status);
  }

  @Delete("subscribers/:id")
  @HttpCode(204)
  @RequirePermission("settings", "manage")
  @ApiOperation({ summary: "Delete a subscriber" })
  async remove(@Actor() ctx: ActorContext, @Param("id", ParseUUIDPipe) id: string) {
    await this.website.remove(ctx.tenantId, id);
  }

  @Get("messages")
  @RequirePermission("settings", "view")
  @ApiOperation({ summary: "Contact-form messages (archived hidden unless status=ARCHIVED) + unread count" })
  messages(@Actor() ctx: ActorContext, @Query() q: MessageQueryDto) {
    return this.website.messages(ctx.tenantId, q);
  }

  @Patch("messages/:id")
  @RequirePermission("settings", "manage")
  @ApiOperation({ summary: "Mark a message read / replied / archived / new" })
  setMessageStatus(@Actor() ctx: ActorContext, @Param("id", ParseUUIDPipe) id: string, @Body() dto: MessageStatusDto) {
    return this.website.setMessageStatus(ctx.tenantId, id, dto.status);
  }

  @Delete("messages/:id")
  @HttpCode(204)
  @RequirePermission("settings", "manage")
  @ApiOperation({ summary: "Delete a message" })
  async removeMessage(@Actor() ctx: ActorContext, @Param("id", ParseUUIDPipe) id: string) {
    await this.website.removeMessage(ctx.tenantId, id);
  }
}
