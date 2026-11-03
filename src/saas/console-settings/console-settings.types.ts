/**
 * Owner Console settings — identical to the console's consoleSettingsSchema types
 * (lms-owner-console: src/validations/consoleSettingsSchema.ts + src/lib/consoleSettingsStorage.ts).
 */

export const CONSOLE_SETTINGS_SECTIONS = ["company", "billing", "trials", "email"] as const;
export type ConsoleSettingsSection = (typeof CONSOLE_SETTINGS_SECTIONS)[number];

export const CONSOLE_GATEWAY_KEYS = ["stripe", "sslcommerz", "bkash"] as const;
export type ConsoleGatewayKey = (typeof CONSOLE_GATEWAY_KEYS)[number];

export const CONSOLE_GATEWAY_MODES = ["LIVE", "TEST"] as const;
export const CONSOLE_CURRENCIES = ["USD"] as const;

export interface CompanySettings {
  legalName: string;
  address: string;
  supportEmail: string;
  website: string;
  taxId: string;
  logoUrl: string;
}

export interface ConsoleGatewaySettings {
  enabled: boolean;
  mode: (typeof CONSOLE_GATEWAY_MODES)[number];
  publicKey: string;
  /** Write-only: "" keeps the saved secret; responses always carry "" (see `secretHints`). */
  secretKey: string;
}

export interface BillingSettings {
  currency: (typeof CONSOLE_CURRENCIES)[number];
  /** Percent; used for invoices of countries without a specific tax rate. */
  taxRate: number;
  invoicePrefix: string;
  invoiceFooter: string;
  stripe: ConsoleGatewaySettings;
  sslcommerz: ConsoleGatewaySettings;
  bkash: ConsoleGatewaySettings;
}

export interface TrialsSettings {
  defaultTrialDays: number;
  requireCardForTrial: boolean;
  gracePeriodDays: number;
  retryScheduleDays: number[];
  suspendAfterGrace: boolean;
}

export interface EmailSettings {
  senderName: string;
  replyTo: string;
  trialEnding: boolean;
  trialEndingDays: number;
  paymentFailed: boolean;
  receipt: boolean;
  renewalReminder: boolean;
  cancellation: boolean;
  welcome: boolean;
}

export interface ConsoleSettings {
  company: CompanySettings;
  billing: BillingSettings;
  trials: TrialsSettings;
  email: EmailSettings;
}

/** GET response — the console's ConsoleSettingsStore. */
export interface ConsoleSettingsStore {
  settings: ConsoleSettings;
  /** "billing.stripe.secretKey" → "••••4e19". */
  secretHints: Record<string, string>;
  /** Section → last saved ISO time ("" = never saved, defaults in use). */
  updatedAt: Record<ConsoleSettingsSection, string>;
}

/** Stored per secret path: AES-GCM cipher (common/crypto.ts) + masked hint. */
export type StoredConsoleSecrets = Record<string, { cipher: string; hint: string }>;
