import { Injectable } from "@nestjs/common";
import { decryptSecret } from "../../common/crypto";
import { PrismaService } from "../../prisma/prisma.service";
import { scopeKeyOf, storedSecrets, toSettings, workspaceDefaults } from "../workspace-settings.mapper";
import { mergeSection } from "../workspace-settings.rules";
import type { PlatformSettings, SettingsSection } from "../workspace-settings.types";

/**
 * Read-only access to a workspace's settings for other modules (exported by WorkspaceSettingsModule).
 * e.g. `timezone(tenantId)` for when workspace-time.ts stops assuming Asia/Dhaka.
 */
@Injectable()
export class WorkspaceSettingsReader {
  constructor(private readonly prisma: PrismaService) {}

  /** Workspace defaults (institution name as platform name). */
  async defaults(tenantId: string | null): Promise<PlatformSettings> {
    if (!tenantId) return workspaceDefaults();
    const inst = await this.prisma.institution.findUnique({ where: { id: tenantId }, select: { name: true } });
    return workspaceDefaults(inst?.name);
  }

  async all(tenantId: string | null): Promise<PlatformSettings> {
    const [row, defaults] = await Promise.all([this.prisma.workspaceSettings.findUnique({ where: { scopeKey: scopeKeyOf(tenantId) } }), this.defaults(tenantId)]);
    return toSettings(row, defaults);
  }

  async section<K extends SettingsSection>(tenantId: string | null, section: K): Promise<PlatformSettings[K]> {
    const row = await this.prisma.workspaceSettings.findUnique({ where: { scopeKey: scopeKeyOf(tenantId) }, select: { [section]: true } as Record<K, true> });
    return mergeSection(section, (row as Record<string, unknown> | null)?.[section], await this.defaults(tenantId));
  }

  /** IANA timezone from Settings › General (default "Asia/Dhaka"). */
  async timezone(tenantId: string | null): Promise<string> {
    return (await this.section(tenantId, "general")).timezone;
  }

  /** Decrypted secret for server-side use only (e.g. "payments.stripe.secretKey"); null when not set. Never return it to a client. */
  async secret(tenantId: string | null, path: string): Promise<string | null> {
    const row = await this.prisma.workspaceSettings.findUnique({ where: { scopeKey: scopeKeyOf(tenantId) }, select: { secrets: true } });
    const s = storedSecrets(row)[path];
    return s ? decryptSecret(s.cipher) : null;
  }
}
