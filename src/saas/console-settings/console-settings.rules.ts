import { CONSOLE_SECRET_PATHS, defaultConsoleSettings, SECRET_MASK } from "./console-settings.constants";
import {
  CONSOLE_GATEWAY_KEYS,
  CONSOLE_SETTINGS_SECTIONS,
  type ConsoleSettings,
  type ConsoleSettingsSection,
  type ConsoleSettingsStore,
  type StoredConsoleSecrets,
} from "./console-settings.types";

/** Pure console-settings logic: cross-field rules (the console's superRefine), defaults merge, secrets, store shape. */

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);

// ---------------------------------------------------------------- cross-field rules

export function consoleSettingsErrors<K extends ConsoleSettingsSection>(section: K, values: ConsoleSettings[K]): string[] {
  const errors: string[] = [];
  if (section === "billing") {
    const v = values as ConsoleSettings["billing"];
    CONSOLE_GATEWAY_KEYS.forEach((key) => {
      if (v[key].enabled && !v[key].publicKey) errors.push("Add the public key before enabling this gateway");
    });
    if (!CONSOLE_GATEWAY_KEYS.some((key) => v[key].enabled)) errors.push("Enable at least one gateway to collect subscription fees");
  }
  if (section === "trials") {
    const v = values as ConsoleSettings["trials"];
    const last = v.retryScheduleDays[v.retryScheduleDays.length - 1] ?? 0;
    if (v.suspendAfterGrace && last > v.gracePeriodDays) errors.push(`The last retry (day ${last}) is after the ${v.gracePeriodDays}-day grace period`);
    if (v.retryScheduleDays.some((d, i) => i > 0 && d <= v.retryScheduleDays[i - 1]!)) errors.push("Retry days must be in increasing order");
  }
  return [...new Set(errors)];
}

// ---------------------------------------------------------------- defaults

/** Stored section JSON over the defaults (one nested level, so fields added later get their default). */
export function mergeConsoleSection<K extends ConsoleSettingsSection>(section: K, stored: unknown, defaults: ConsoleSettings = defaultConsoleSettings()): ConsoleSettings[K] {
  const base = defaults[section] as unknown as Obj;
  if (!isObj(stored)) return structuredClone(base) as unknown as ConsoleSettings[K];
  const out: Obj = {};
  for (const [k, d] of Object.entries(base)) {
    const s = stored[k];
    out[k] = isObj(d) ? { ...d, ...(isObj(s) ? s : {}) } : s === undefined ? d : s;
  }
  return out as unknown as ConsoleSettings[K];
}

// ---------------------------------------------------------------- secrets

export const maskSecret = (plain: string) => `${SECRET_MASK}${plain.slice(-4)}`;

/**
 * Billing gateway secrets: non-empty → encrypted + hinted (replaces the stored one), empty → stored one kept.
 * Returns the section with every secret blanked, the next secrets map and the paths that changed.
 */
export function extractConsoleSecrets<K extends ConsoleSettingsSection>(
  section: K,
  values: ConsoleSettings[K],
  stored: StoredConsoleSecrets,
  encrypt: (plain: string) => string,
): { clean: ConsoleSettings[K]; secrets: StoredConsoleSecrets; changed: string[] } {
  const clean = structuredClone(values);
  const secrets = { ...stored };
  const changed: string[] = [];
  if (section === "billing") {
    const billing = clean as ConsoleSettings["billing"];
    CONSOLE_GATEWAY_KEYS.forEach((key) => {
      const secret = billing[key].secretKey.trim();
      const path = `billing.${key}.secretKey`;
      if (secret) {
        secrets[path] = { cipher: encrypt(secret), hint: maskSecret(secret) };
        changed.push(path);
      }
      billing[key].secretKey = "";
    });
  }
  return { clean, secrets, changed };
}

export const storedConsoleSecrets = (raw: unknown): StoredConsoleSecrets =>
  isObj(raw) ? (Object.fromEntries(Object.entries(raw).filter(([k, v]) => CONSOLE_SECRET_PATHS.includes(k) && isObj(v))) as StoredConsoleSecrets) : {};

// ---------------------------------------------------------------- store

export interface ConsoleSettingsRowLike {
  company?: unknown;
  billing?: unknown;
  trials?: unknown;
  email?: unknown;
  secrets?: unknown;
  sectionUpdatedAt?: unknown;
}

export function toConsoleSettings(row: ConsoleSettingsRowLike | null): ConsoleSettings {
  const defaults = defaultConsoleSettings();
  const settings = Object.fromEntries(CONSOLE_SETTINGS_SECTIONS.map((s) => [s, mergeConsoleSection(s, row?.[s], defaults)])) as unknown as ConsoleSettings;
  // Secrets are never echoed back, whatever is in the JSON.
  CONSOLE_GATEWAY_KEYS.forEach((k) => (settings.billing[k].secretKey = ""));
  return settings;
}

/** Row → the console's ConsoleSettingsStore (secrets only as masked hints). */
export function toConsoleSettingsStore(row: ConsoleSettingsRowLike | null): ConsoleSettingsStore {
  const updated = (isObj(row?.sectionUpdatedAt) ? row!.sectionUpdatedAt : {}) as Partial<Record<ConsoleSettingsSection, string>>;
  return {
    settings: toConsoleSettings(row),
    secretHints: Object.fromEntries(Object.entries(storedConsoleSecrets(row?.secrets)).map(([path, s]) => [path, s.hint])),
    updatedAt: Object.fromEntries(CONSOLE_SETTINGS_SECTIONS.map((s) => [s, updated[s] ?? ""])) as Record<ConsoleSettingsSection, string>,
  };
}
