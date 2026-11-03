import type { GatewaySettings, IntegrationSettings, PlatformSettings, SettingsSection } from "./workspace-settings.types";

export const DATE_FORMATS = ["MMM D, YYYY", "DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"] as const;
export const TIME_FORMATS = ["12h", "24h"] as const;
export const CURRENCIES = ["USD", "BDT", "EUR", "GBP", "INR"] as const;
export const WEEK_STARTS = ["SUNDAY", "MONDAY", "SATURDAY"] as const;
export const ACCENTS = ["orange", "blue", "green", "purple", "navy"] as const;
export const ENROLLMENT_APPROVALS = ["AUTO", "MANUAL"] as const;
export const GATEWAY_MODES = ["LIVE", "TEST"] as const;
export const EMAIL_PROVIDERS = ["RESEND", "SMTP"] as const;
export const DIGEST_DAYS = ["MONDAY", "FRIDAY", "SUNDAY"] as const;
export const BACKUP_FREQUENCIES = ["DAILY", "WEEKLY"] as const;

/** Workspace key for the legacy single-tenant data (institutionId = null). */
export const LEGACY_SCOPE = "legacy";
export const AUDIT_MAX = 50;
/** Changed-field labels kept in one audit summary before "+N more". */
export const AUDIT_SUMMARY_FIELDS = 4;
export const SECRET_MASK = "••••";

/** Write-only fields per section (paths inside the section). */
export const SECRET_FIELDS: Record<SettingsSection, string[]> = {
  general: [],
  branding: [],
  learning: [],
  payments: ["sslcommerz.secretKey", "stripe.secretKey", "bkash.secretKey"],
  email: ["resendApiKey", "smtpPassword"],
  security: [],
  integrations: ["zoom.apiKey", "googleMeet.apiKey", "cloudinary.apiKey", "ai.apiKey", "googleAnalytics.apiKey"],
  maintenance: [],
};

export const TWO_FACTOR_SETUP_MESSAGE = "Your workspace requires two-factor authentication. Set it up in Settings › Security.";

const gateway = (): GatewaySettings => ({ enabled: false, mode: "TEST", publicKey: "", secretKey: "" });
const integration = (option = ""): IntegrationSettings => ({ connected: false, accountLabel: "", apiKey: "", option });

/**
 * Defaults for a workspace that never saved a section. Same shape as the panel's defaultSettingsStore, but
 * without the mock data: nothing is "connected", no gateway is on, and admin 2FA starts OFF so turning the
 * backend on doesn't lock existing staff out — the owner opts in from Settings › Security.
 */
export function defaultSettings(): PlatformSettings {
  return {
    general: {
      platformName: "EduPro",
      tagline: "",
      supportEmail: "support@edupro.com",
      supportPhone: "",
      websiteUrl: "",
      address: "",
      timezone: "Asia/Dhaka",
      dateFormat: "MMM D, YYYY",
      timeFormat: "12h",
      currency: "BDT",
      weekStartsOn: "SATURDAY",
    },
    branding: {
      logoUrl: "",
      logoDarkUrl: "",
      faviconUrl: "",
      loginImageUrl: "",
      accent: "orange",
      loginHeadline: "Welcome back",
      loginSubtext: "Manage courses, students and payments from one place.",
      footerText: "",
      showPoweredBy: true,
    },
    learning: {
      enrollmentApproval: "AUTO",
      allowGuestPreview: true,
      completionThreshold: 90,
      sequentialLessons: false,
      allowReviews: true,
      reviewModeration: true,
      enableCommunity: true,
      autoIssueCertificates: true,
      maxUploadMb: 50,
      defaultPassingScore: 70,
      lateSubmissionPenalty: 10,
    },
    payments: {
      sslcommerz: gateway(),
      stripe: gateway(),
      bkash: gateway(),
      taxRate: 0,
      taxInclusive: false,
      refundWindowDays: 14,
      invoicePrefix: "INV",
      invoiceFooter: "",
    },
    email: {
      senderName: "EduPro",
      senderEmail: "no-reply@edupro.com",
      replyTo: "",
      provider: "RESEND",
      resendApiKey: "",
      smtpHost: "",
      smtpPort: 587,
      smtpUser: "",
      smtpPassword: "",
      smtpSecure: true,
      digestEnabled: true,
      digestDay: "MONDAY",
    },
    security: {
      requireAdmin2fa: false,
      passwordMinLength: 10,
      requireUppercase: true,
      requireNumber: true,
      requireSymbol: false,
      passwordExpiryDays: null,
      sessionTimeoutMinutes: 120,
      maxLoginAttempts: 5,
      lockoutMinutes: 15,
      ipAllowlistEnabled: false,
      ipAllowlist: [],
    },
    integrations: {
      zoom: integration(),
      googleMeet: integration(),
      cloudinary: integration(),
      ai: integration("llama-3.3-70b"),
      googleAnalytics: integration(),
    },
    maintenance: {
      maintenanceMode: false,
      maintenanceMessage: "We're upgrading the platform. We'll be back shortly.",
      maintenanceUntil: "",
      allowAdminsDuringMaintenance: true,
      autoBackup: true,
      backupFrequency: "DAILY",
      backupRetentionDays: 30,
    },
  };
}
