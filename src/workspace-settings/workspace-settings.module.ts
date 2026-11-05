import { Module } from "@nestjs/common";
import { MailService } from "../auth/mail/mail.service";
import { PrismaModule } from "../prisma/prisma.module";
import { AdminWorkspaceSettingsController } from "./admin-workspace-settings.controller";
import { PublicWorkspaceSettingsController } from "./public-workspace-settings.controller";
import { WorkspaceSettingsReader } from "./services/workspace-settings-reader.service";
import { WorkspaceSettingsService } from "./services/workspace-settings.service";
import { WorkspaceBackupsService } from "./backups/workspace-backups.service";

/**
 * Admin panel › Settings, one row per workspace (WorkspaceSettings; institutionId null = legacy workspace).
 *   /admin/settings            GET store, PATCH /:section, secrets/clear, integrations/:key/test, email/test
 *   /settings/public           unauthenticated branding (?institution=<slug>)
 * Secrets are AES-GCM encrypted (common/crypto) and only returned as "••••last4" hints.
 * Security › requireAdmin2fa is enforced by PermissionsGuard (team module) via two-factor-policy.ts.
 * Backups: /admin/settings/backups (list, POST = back up now, :id/download, DELETE) + the nightly job
 * (WorkspaceBackupsService, 02:00 Asia/Dhaka, retention from Maintenance › Keep backups for).
 * Other modules read settings through WorkspaceSettingsReader (e.g. timezone(tenantId)).
 */
@Module({
  imports: [PrismaModule],
  controllers: [AdminWorkspaceSettingsController, PublicWorkspaceSettingsController],
  providers: [WorkspaceSettingsService, WorkspaceSettingsReader, WorkspaceBackupsService, MailService],
  exports: [WorkspaceSettingsReader],
})
export class WorkspaceSettingsModule {}
