import { AUDIT_SUMMARY_FIELDS, SECRET_FIELDS, SECRET_MASK, defaultSettings } from "./workspace-settings.constants";
import { GATEWAY_KEYS, type PlatformSettings, type SettingsSection, type StoredSecrets } from "./workspace-settings.types";

/** Pure settings logic: cross-field rules, defaults merge, secret extraction and audit summaries. */

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);

// ---------------------------------------------------------------- cross-field rules (the panel's superRefine)

export function settingsRuleErrors<K extends SettingsSection>(section: K, values: PlatformSettings[K]): string[] {
  const errors: string[] = [];
  if (section === "payments") {
    const v = values as PlatformSettings["payments"];
    if (GATEWAY_KEYS.every((g) => !v[g].enabled)) errors.push("Enable at least one payment gateway");
    GATEWAY_KEYS.forEach((g) => v[g].enabled && !v[g].publicKey && errors.push(`${g}.publicKey: Required when the gateway is enabled`));
  }
  if (section === "email") {
    const v = values as PlatformSettings["email"];
    if (v.provider === "SMTP" && !v.smtpHost) errors.push("SMTP host is required");
    if (v.provider === "SMTP" && !v.smtpUser) errors.push("SMTP username is required");
  }
  if (section === "security") {
    const v = values as PlatformSettings["security"];
    if (v.ipAllowlistEnabled && v.ipAllowlist.length === 0) errors.push("Add at least one IP or turn the allowlist off");
  }
  if (section === "maintenance") {
    const v = values as PlatformSettings["maintenance"];
    if (v.maintenanceMode && v.maintenanceMessage.length < 10) errors.push("Tell visitors what's happening (at least 10 characters)");
  }
  return errors;
}

// ---------------------------------------------------------------- defaults

/** Stored section JSON over the defaults (one nested level, so new fields added later get their default). */
export function mergeSection<K extends SettingsSection>(section: K, stored: unknown, defaults: PlatformSettings = defaultSettings()): PlatformSettings[K] {
  const base = defaults[section] as unknown as Obj;
  if (!isObj(stored)) return structuredClone(base) as unknown as PlatformSettings[K];
  const out: Obj = {};
  for (const [k, d] of Object.entries(base)) {
    const s = stored[k];
    if (isObj(d)) out[k] = { ...d, ...(isObj(s) ? s : {}) };
    else out[k] = s === undefined ? d : s;
  }
  return out as unknown as PlatformSettings[K];
}

// ---------------------------------------------------------------- secrets

const getPath = (o: unknown, path: string): unknown => path.split(".").reduce<unknown>((x, k) => (isObj(x) ? x[k] : undefined), o);
function setPath(o: Obj, path: string, v: unknown) {
  const keys = path.split(".");
  let cur = o;
  for (const k of keys.slice(0, -1)) cur = cur[k] as Obj;
  cur[keys[keys.length - 1]] = v;
}

export const maskSecret = (plain: string) => `${SECRET_MASK}${plain.slice(-4)}`;
export const secretPath = (section: SettingsSection, path: string) => `${section}.${path}`;
export const isSecretPath = (full: string) => {
  const [section, ...rest] = full.split(".");
  return (SECRET_FIELDS[section as SettingsSection] ?? []).includes(rest.join("."));
};

/**
 * Pulls the write-only fields out of a submitted section: non-empty → encrypted (replaces the stored one),
 * empty → stored secret kept. Returns the section with every secret blanked plus the next secrets map.
 */
export function extractSecrets<K extends SettingsSection>(
  section: K,
  values: PlatformSettings[K],
  stored: StoredSecrets,
  encrypt: (plain: string) => string,
): { clean: PlatformSettings[K]; secrets: StoredSecrets; changed: string[] } {
  const clean = structuredClone(values) as unknown as Obj;
  const secrets = { ...stored };
  const changed: string[] = [];
  for (const path of SECRET_FIELDS[section]) {
    const v = getPath(clean, path);
    if (typeof v === "string" && v.length > 0) {
      secrets[secretPath(section, path)] = { cipher: encrypt(v), hint: maskSecret(v) };
      changed.push(path);
    }
    if (getPath(clean, path) !== undefined) setPath(clean, path, "");
  }
  return { clean: clean as unknown as PlatformSettings[K], secrets, changed };
}

export const secretHints = (secrets: StoredSecrets): Record<string, string> =>
  Object.fromEntries(Object.entries(secrets).map(([path, s]) => [path, s.hint]));

// ---------------------------------------------------------------- audit

/** "platformName" → "Platform Name" (same wording as the panel's useSettingsSection). */
export const humanize = (key: string) =>
  key
    .replace(/\./g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase())
    .replace(/\b(Url|Api|Ip|Smtp|Mb|Ai)\b/g, (m) => m.toUpperCase());

/** Top-level (and one nested level) keys whose values differ. */
export function changedKeys(before: Obj, after: Obj): string[] {
  return Object.keys(after).flatMap((k) => {
    const x = before[k];
    const y = after[k];
    if (isObj(x) && isObj(y)) return Object.keys(y).filter((n) => JSON.stringify(x[n]) !== JSON.stringify(y[n])).map((n) => `${k}.${n}`);
    return JSON.stringify(x) === JSON.stringify(y) ? [] : [k];
  });
}

/** "Platform name, Timezone +2 more" — null when nothing changed. */
export function auditSummary(labels: string[]): string | null {
  if (!labels.length) return null;
  const more = labels.length - AUDIT_SUMMARY_FIELDS;
  return labels.slice(0, AUDIT_SUMMARY_FIELDS).join(", ") + (more > 0 ? ` +${more} more` : "");
}

// ---------------------------------------------------------------- reads used by other modules

/** Stored security JSON → is admin 2FA required? (missing/never saved → the default). */
export const requireAdmin2faOf = (security: unknown): boolean => mergeSection("security", security).requireAdmin2fa === true;
