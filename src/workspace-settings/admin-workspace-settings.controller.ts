import { Body, Controller, createParamDecorator, Delete, ExecutionContext, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { RequireRoles, ValidateDto } from "../common/auth-user";
import { AllowPendingTwoFactor, RequirePermission } from "../team/permissions.guard";
import type { ActorContext } from "../team/services/team-access.service";
import {
  BrandingSettingsDto,
  ClearSecretDto,
  EmailSettingsDto,
  GeneralSettingsDto,
  IntegrationsSettingsDto,
  LearningSettingsDto,
  MaintenanceSettingsDto,
  PaymentSettingsDto,
  SecuritySettingsDto,
  TestEmailDto,
} from "./dto/workspace-settings.dto";
import { WorkspaceSettingsService } from "./services/workspace-settings.service";
import { WorkspaceBackupsService } from "./backups/workspace-backups.service";

/** Staff context resolved by PermissionsGuard. */
const Actor = createParamDecorator((_: unknown, ctx: ExecutionContext): ActorContext => ctx.switchToHttp().getRequest().teamAccess);

/**
 * Admin panel › Settings. GET returns the panel's SettingsStore; each section is saved whole with its own PATCH
 * (secret fields: "" = keep the stored value; responses only carry masked `secretHints`).
 */
@ApiTags("Admin · Settings")
@Controller("admin/settings")
@RequireRoles("ADMIN")
@ValidateDto()
export class AdminWorkspaceSettingsController {
  constructor(
    private readonly settings: WorkspaceSettingsService,
    private readonly backups: WorkspaceBackupsService,
  ) {}

  // ---------------------------------------------------------------- Maintenance › Backups

  @Get("backups")
  @RequirePermission("settings", "view")
  @ApiOperation({ summary: "Backups of this workspace, newest first (no file data)" })
  listBackups(@Actor() ctx: ActorContext) {
    return this.backups.list(ctx.tenantId);
  }

  @Post("backups")
  @RequirePermission("settings", "manage")
  @ApiOperation({ summary: "Back up now: snapshot the workspace's data (gzipped JSON; passwords, secrets and tokens removed)" })
  createBackup(@Actor() ctx: ActorContext) {
    return this.backups.create(ctx.tenantId, "MANUAL", ctx.name);
  }

  @Get("backups/:id/download")
  @RequirePermission("settings", "manage")
  @ApiOperation({ summary: "Download one backup (.json.gz)" })
  async downloadBackup(@Actor() ctx: ActorContext, @Param("id", ParseUUIDPipe) id: string, @Res() res: Response) {
    const file = await this.backups.download(ctx.tenantId, id);
    res.setHeader("Content-Type", "application/gzip");
    res.setHeader("Content-Disposition", `attachment; filename="${file.filename}"`);
    res.setHeader("Content-Length", String(file.data.length));
    res.end(file.data);
  }

  @Delete("backups/:id")
  @HttpCode(204)
  @RequirePermission("settings", "manage")
  @ApiOperation({ summary: "Delete one backup" })
  async deleteBackup(@Actor() ctx: ActorContext, @Param("id", ParseUUIDPipe) id: string) {
    await this.backups.remove(ctx.tenantId, id);
  }

  @Get()
  @RequirePermission("settings", "view")
  @AllowPendingTwoFactor()
  @ApiOperation({ summary: "All sections (defaults when never saved), masked secret hints, audit and per-section last-saved times" })
  get(@Actor() ctx: ActorContext) {
    return this.settings.store(ctx.tenantId);
  }

  @Get("client-ip")
  @RequirePermission("settings", "view")
  @ApiOperation({ summary: "The caller's IP as the API sees it (Security › IP allowlist lock-out warning)" })
  clientIp(@Req() req: Request) {
    return { ip: (req.ip ?? "").replace(/^::ffff:/, "") };
  }

  @Patch("general")
  @RequirePermission("settings", "manage")
  general(@Actor() ctx: ActorContext, @Body() dto: GeneralSettingsDto) {
    return this.settings.save(ctx, "general", dto);
  }

  @Patch("branding")
  @RequirePermission("settings", "manage")
  branding(@Actor() ctx: ActorContext, @Body() dto: BrandingSettingsDto) {
    return this.settings.save(ctx, "branding", dto);
  }

  @Patch("learning")
  @RequirePermission("settings", "manage")
  learning(@Actor() ctx: ActorContext, @Body() dto: LearningSettingsDto) {
    return this.settings.save(ctx, "learning", dto);
  }

  @Patch("payments")
  @RequirePermission("settings", "manage")
  payments(@Actor() ctx: ActorContext, @Body() dto: PaymentSettingsDto) {
    return this.settings.save(ctx, "payments", dto);
  }

  @Patch("email")
  @RequirePermission("settings", "manage")
  email(@Actor() ctx: ActorContext, @Body() dto: EmailSettingsDto) {
    return this.settings.save(ctx, "email", dto);
  }

  @Patch("security")
  @RequirePermission("settings", "manage")
  @ApiOperation({ summary: "Includes requireAdmin2fa — enforced by PermissionsGuard on every staff endpoint" })
  security(@Actor() ctx: ActorContext, @Body() dto: SecuritySettingsDto) {
    return this.settings.save(ctx, "security", dto);
  }

  @Patch("integrations")
  @RequirePermission("settings", "manage")
  integrations(@Actor() ctx: ActorContext, @Body() dto: IntegrationsSettingsDto) {
    return this.settings.save(ctx, "integrations", dto);
  }

  @Patch("maintenance")
  @RequirePermission("settings", "manage")
  maintenance(@Actor() ctx: ActorContext, @Body() dto: MaintenanceSettingsDto) {
    return this.settings.save(ctx, "maintenance", dto);
  }

  // ---------------------------------------------------------------- actions

  @Post("secrets/clear")
  @HttpCode(200)
  @RequirePermission("settings", "manage")
  @ApiOperation({ summary: "Remove a stored secret, e.g. { path: \"integrations.zoom.apiKey\" }" })
  clearSecret(@Actor() ctx: ActorContext, @Body() dto: ClearSecretDto) {
    return this.settings.clearSecret(ctx, dto.path);
  }

  @Post("integrations/:key/test")
  @HttpCode(200)
  @RequirePermission("settings", "manage")
  testIntegration(@Actor() ctx: ActorContext, @Param("key") key: string) {
    return this.settings.testIntegration(ctx, key);
  }

  @Post("payments/:gateway/test")
  @HttpCode(200)
  @RequirePermission("settings", "manage")
  @ApiOperation({ summary: "Checks a gateway's saved setup (enabled, public key, stored secret); `missing` lists what's absent" })
  testGateway(@Actor() ctx: ActorContext, @Param("gateway") gateway: string) {
    return this.settings.testGateway(ctx, gateway);
  }

  @Post("email/test")
  @HttpCode(200)
  @RequirePermission("settings", "manage")
  testEmail(@Actor() ctx: ActorContext, @Body() dto: TestEmailDto) {
    return this.settings.sendTestEmail(ctx, dto.to);
  }
}
