/**
 * Workspace settings — backend copy of the panel's PlatformSettings / SettingsStore
 * (lms-admin-panel src/validations/platformSettingsSchema.ts + src/lib/settingsStorage.ts). Keep in sync.
 */

export const SETTINGS_SECTIONS = ["general", "branding", "learning", "payments", "email", "security", "integrations", "maintenance"] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export interface GeneralSettings {
  platformName: string;
  tagline: string;
  supportEmail: string;
  supportPhone: string;
  websiteUrl: string;
  address: string;
  timezone: string;
  dateFormat: "MMM D, YYYY" | "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD";
  timeFormat: "12h" | "24h";
  currency: "USD" | "BDT" | "EUR" | "GBP" | "INR";
  weekStartsOn: "SUNDAY" | "MONDAY" | "SATURDAY";
}

export interface BrandingSettings {
  logoUrl: string;
  logoDarkUrl: string;
  faviconUrl: string;
  loginImageUrl: string;
  accent: "orange" | "blue" | "green" | "purple" | "navy";
  loginHeadline: string;
  loginSubtext: string;
  footerText: string;
  showPoweredBy: boolean;
}

export interface LearningSettings {
  enrollmentApproval: "AUTO" | "MANUAL";
  allowGuestPreview: boolean;
  completionThreshold: number;
  sequentialLessons: boolean;
  allowReviews: boolean;
  reviewModeration: boolean;
  enableCommunity: boolean;
  autoIssueCertificates: boolean;
  maxUploadMb: number;
  defaultPassingScore: number;
  lateSubmissionPenalty: number;
}

export interface GatewaySettings {
  enabled: boolean;
  mode: "LIVE" | "TEST";
  publicKey: string;
  /** Write-only: always "" in responses; "" on save = keep the stored secret. */
  secretKey: string;
}

export const GATEWAY_KEYS = ["sslcommerz", "stripe", "bkash"] as const;
export type GatewayKey = (typeof GATEWAY_KEYS)[number];

export interface PaymentSettings extends Record<GatewayKey, GatewaySettings> {
  taxRate: number;
  taxInclusive: boolean;
  refundWindowDays: number;
  invoicePrefix: string;
  invoiceFooter: string;
}

export interface EmailSettings {
  senderName: string;
  senderEmail: string;
  replyTo: string;
  provider: "RESEND" | "SMTP";
  /** Write-only (see GatewaySettings.secretKey). */
  resendApiKey: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  /** Write-only (see GatewaySettings.secretKey). */
  smtpPassword: string;
  smtpSecure: boolean;
  digestEnabled: boolean;
  digestDay: "MONDAY" | "FRIDAY" | "SUNDAY";
}

export interface SecuritySettings {
  requireAdmin2fa: boolean;
  passwordMinLength: number;
  requireUppercase: boolean;
  requireNumber: boolean;
  requireSymbol: boolean;
  passwordExpiryDays: number | null;
  sessionTimeoutMinutes: number;
  maxLoginAttempts: number;
  lockoutMinutes: number;
  ipAllowlistEnabled: boolean;
  ipAllowlist: string[];
}

export const INTEGRATION_KEYS = ["zoom", "googleMeet", "cloudinary", "ai", "googleAnalytics"] as const;
export type IntegrationKey = (typeof INTEGRATION_KEYS)[number];

export interface IntegrationSettings {
  connected: boolean;
  accountLabel: string;
  /** Write-only (see GatewaySettings.secretKey). */
  apiKey: string;
  option: string;
}
export type IntegrationsSettings = Record<IntegrationKey, IntegrationSettings>;

export interface MaintenanceSettings {
  maintenanceMode: boolean;
  maintenanceMessage: string;
  maintenanceUntil: string;
  allowAdminsDuringMaintenance: boolean;
  autoBackup: boolean;
  backupFrequency: "DAILY" | "WEEKLY";
  backupRetentionDays: number;
}

export interface PlatformSettings {
  general: GeneralSettings;
  branding: BrandingSettings;
  learning: LearningSettings;
  payments: PaymentSettings;
  email: EmailSettings;
  security: SecuritySettings;
  integrations: IntegrationsSettings;
  maintenance: MaintenanceSettings;
}

export interface SettingsAuditEntry {
  id: string;
  section: SettingsSection;
  /** Human list of changed fields, e.g. "Platform name, Timezone". */
  summary: string;
  actor: string;
  at: string;
}

export interface BackupEntry {
  id: string;
  at: string;
  sizeMb: number;
  kind: "AUTO" | "MANUAL";
  status: "COMPLETED" | "FAILED";
}

/** GET /admin/settings — the panel's SettingsStore. */
export interface SettingsStore {
  settings: PlatformSettings;
  /** Masked secrets for display: "payments.stripe.secretKey" → "••••4e19". Absent = nothing stored. */
  secretHints: Record<string, string>;
  audit: SettingsAuditEntry[];
  backups: BackupEntry[];
  updatedAt: Record<SettingsSection, string>;
}

/** Stored encrypted secret. */
export interface StoredSecret {
  cipher: string;
  hint: string;
}
export type StoredSecrets = Record<string, StoredSecret>;

/** GET /settings/public — safe, unauthenticated branding for login pages / student apps. */
export interface PublicWorkspaceSettings {
  platformName: string;
  tagline: string;
  supportEmail: string;
  supportPhone: string;
  websiteUrl: string;
  timezone: string;
  currency: GeneralSettings["currency"];
  branding: BrandingSettings;
  maintenance: { enabled: boolean; message: string; until: string };
}
