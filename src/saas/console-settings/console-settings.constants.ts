import { SAAS_TRIAL_DAYS } from "../saas.constants";
import { CONSOLE_GATEWAY_KEYS, type ConsoleSettings } from "./console-settings.types";

/** Single platform row id. */
export const CONSOLE_SETTINGS_ROW_ID = "platform";

export const SECRET_MASK = "••••";

/** Write-only fields: "billing.<gateway>.secretKey". */
export const CONSOLE_SECRET_PATHS = CONSOLE_GATEWAY_KEYS.map((k) => `billing.${k}.secretKey`);

export const INVOICE_PREFIX_REGEX = /^[A-Z]{2,6}$/;
export const OPTIONAL_URL_REGEX = /^$|^https?:\/\/[^\s.]+\.[^\s]+$/i;
export const DEFAULT_INVOICE_PREFIX = "EDP";

/**
 * Defaults until the owner saves a section — the console's defaultConsoleSettings() minus its mock data
 * (no fake gateway keys / secret hints; gateways start disabled until keys are added).
 */
export function defaultConsoleSettings(): ConsoleSettings {
  const gateway = () => ({ enabled: false, mode: "TEST" as const, publicKey: "", secretKey: "" });
  return {
    company: {
      legalName: "EduPro Technologies Ltd.",
      address: "Level 9, 34 Gulshan Avenue, Dhaka 1212, Bangladesh",
      supportEmail: "billing@edupro.com",
      website: "https://edupro.com",
      taxId: "",
      logoUrl: "",
    },
    billing: {
      currency: "USD",
      taxRate: 0,
      invoicePrefix: DEFAULT_INVOICE_PREFIX,
      invoiceFooter: "Thank you for building your academy on EduPro.",
      stripe: gateway(),
      sslcommerz: gateway(),
      bkash: gateway(),
    },
    trials: {
      defaultTrialDays: SAAS_TRIAL_DAYS,
      requireCardForTrial: false,
      gracePeriodDays: 7,
      retryScheduleDays: [1, 3, 7],
      suspendAfterGrace: true,
    },
    email: {
      senderName: "EduPro Billing",
      replyTo: "billing@edupro.com",
      trialEnding: true,
      trialEndingDays: 3,
      paymentFailed: true,
      receipt: true,
      renewalReminder: true,
      cancellation: true,
      welcome: true,
    },
  };
}
