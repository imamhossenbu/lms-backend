import type { WorkspaceSettings } from "../../generated/prisma";
import { LEGACY_SCOPE, defaultSettings } from "./workspace-settings.constants";
import { mergeSection, secretHints } from "./workspace-settings.rules";
import {
  SETTINGS_SECTIONS,
  type PlatformSettings,
  type PublicWorkspaceSettings,
  type SettingsAuditEntry,
  type SettingsSection,
  type SettingsStore,
  type StoredSecrets,
} from "./workspace-settings.types";

/** Row key for a workspace: one row per institution, "legacy" for institutionId = null. */
export const scopeKeyOf = (tenantId: string | null) => tenantId ?? LEGACY_SCOPE;

/** Defaults for one workspace: an institution starts with its own name instead of "EduPro". */
export function workspaceDefaults(workspaceName?: string | null): PlatformSettings {
  const d = defaultSettings();
  if (workspaceName) {
    d.general.platformName = workspaceName.slice(0, 60);
    d.email.senderName = workspaceName.slice(0, 60);
  }
  return d;
}

type Row = Pick<WorkspaceSettings, SettingsSection | "secrets" | "sectionUpdatedAt" | "audit">;

export const storedSecrets = (row: Pick<Row, "secrets"> | null): StoredSecrets => (row?.secrets ?? {}) as unknown as StoredSecrets;

export function toSettings(row: Row | null, defaults: PlatformSettings): PlatformSettings {
  return Object.fromEntries(SETTINGS_SECTIONS.map((s) => [s, mergeSection(s, row?.[s], defaults)])) as unknown as PlatformSettings;
}

/** Row → the panel's SettingsStore. Secrets are only ever exposed as masked hints. */
export function toStore(row: Row | null, defaults: PlatformSettings): SettingsStore {
  const updated = (row?.sectionUpdatedAt ?? {}) as Partial<Record<SettingsSection, string>>;
  return {
    settings: toSettings(row, defaults),
    secretHints: secretHints(storedSecrets(row)),
    audit: ((row?.audit ?? []) as unknown as SettingsAuditEntry[]).slice(),
    // Kept for older panels; the list lives at GET /admin/settings/backups.
    backups: [],
    updatedAt: Object.fromEntries(SETTINGS_SECTIONS.map((s) => [s, updated[s] ?? ""])) as Record<SettingsSection, string>,
  };
}

/** Safe subset for unauthenticated pages (login screen, student apps). */
export function toPublic(s: PlatformSettings): PublicWorkspaceSettings {
  return {
    platformName: s.general.platformName,
    tagline: s.general.tagline,
    supportEmail: s.general.supportEmail,
    supportPhone: s.general.supportPhone,
    websiteUrl: s.general.websiteUrl,
    timezone: s.general.timezone,
    currency: s.general.currency,
    branding: s.branding,
    maintenance: { enabled: s.maintenance.maintenanceMode, message: s.maintenance.maintenanceMode ? s.maintenance.maintenanceMessage : "", until: s.maintenance.maintenanceUntil },
  };
}
