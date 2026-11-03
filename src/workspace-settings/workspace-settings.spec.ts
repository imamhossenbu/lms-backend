import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { decryptSecret, encryptSecret } from "../common/crypto";
import { EmailSettingsDto, GeneralSettingsDto, LearningSettingsDto, MaintenanceSettingsDto, PaymentSettingsDto, SecuritySettingsDto } from "./dto/workspace-settings.dto";
import { mustSetUpTwoFactor } from "./two-factor-policy";
import { defaultSettings } from "./workspace-settings.constants";
import { scopeKeyOf, toPublic, toStore, workspaceDefaults } from "./workspace-settings.mapper";
import { auditSummary, changedKeys, extractSecrets, humanize, isSecretPath, mergeSection, requireAdmin2faOf, settingsRuleErrors } from "./workspace-settings.rules";

const messages = (cls: any, body: object) =>
  validateSync(plainToInstance(cls, body), { whitelist: true }).flatMap(function flat(e): string[] {
    return [...Object.values(e.constraints ?? {}), ...(e.children ?? []).flatMap(flat)];
  });

beforeAll(() => (process.env.SUPER_SECRET_KEY ??= "test-secret"));

describe("section DTOs (panel zod messages)", () => {
  const d = defaultSettings();
  it("accepts the defaults of every section that has no cross-field rule", () => {
    expect(messages(GeneralSettingsDto, d.general)).toEqual([]);
    expect(messages(LearningSettingsDto, d.learning)).toEqual([]);
    expect(messages(SecuritySettingsDto, d.security)).toEqual([]);
    expect(messages(EmailSettingsDto, d.email)).toEqual([]);
    expect(messages(MaintenanceSettingsDto, d.maintenance)).toEqual([]);
  });
  it("general", () => {
    const m = messages(GeneralSettingsDto, { ...d.general, platformName: " a ", supportEmail: "nope", supportPhone: "12", websiteUrl: "edupro.com", timezone: "Mars/Base" });
    expect(m).toEqual(expect.arrayContaining(["Platform name is required", "Enter a valid email", "Enter a valid phone number", "Enter a valid URL starting with https://", "Select a timezone"]));
  });
  it("learning + payments + security numbers", () => {
    expect(messages(LearningSettingsDto, { ...d.learning, completionThreshold: 40, maxUploadMb: 5000 })).toEqual(expect.arrayContaining(["At least 50%", "Up to 2048 MB"]));
    expect(messages(PaymentSettingsDto, { ...d.payments, taxRate: -1, invoicePrefix: "inv" })).toEqual(expect.arrayContaining(["Can't be negative", "Use capital letters, numbers and dashes"]));
    expect(messages(SecuritySettingsDto, { ...d.security, passwordMinLength: 4, passwordExpiryDays: 10, ipAllowlist: ["10.0.0.1", "bad"] })).toEqual(
      expect.arrayContaining(["At least 8", "At least 30 days", "Use an IPv4 address or CIDR (e.g. 10.0.0.0/24)"]),
    );
    expect(messages(SecuritySettingsDto, { ...d.security, passwordExpiryDays: null })).toEqual([]);
  });
  it("email reply-to may be empty", () => {
    expect(messages(EmailSettingsDto, { ...d.email, replyTo: "" })).toEqual([]);
    expect(messages(EmailSettingsDto, { ...d.email, replyTo: "x@" })).toEqual(["Enter a valid email"]);
  });
});

describe("cross-field rules", () => {
  const d = defaultSettings();
  it("payments need one enabled gateway with a public key", () => {
    expect(settingsRuleErrors("payments", d.payments)).toEqual(["Enable at least one payment gateway"]);
    expect(settingsRuleErrors("payments", { ...d.payments, stripe: { ...d.payments.stripe, enabled: true } })).toEqual(["stripe.publicKey: Required when the gateway is enabled"]);
    expect(settingsRuleErrors("payments", { ...d.payments, stripe: { ...d.payments.stripe, enabled: true, publicKey: "pk" } })).toEqual([]);
  });
  it("smtp, ip allowlist, maintenance message", () => {
    expect(settingsRuleErrors("email", { ...d.email, provider: "SMTP" })).toEqual(["SMTP host is required", "SMTP username is required"]);
    expect(settingsRuleErrors("security", { ...d.security, ipAllowlistEnabled: true })).toEqual(["Add at least one IP or turn the allowlist off"]);
    expect(settingsRuleErrors("maintenance", { ...d.maintenance, maintenanceMode: true, maintenanceMessage: "brb" })).toEqual(["Tell visitors what's happening (at least 10 characters)"]);
  });
});

describe("defaults merge", () => {
  it("never-saved → defaults; partial stored → filled in, nested too", () => {
    expect(mergeSection("general", null)).toEqual(defaultSettings().general);
    const m = mergeSection("integrations", { zoom: { connected: true } });
    expect(m.zoom).toEqual({ connected: true, accountLabel: "", apiKey: "", option: "" });
    expect(m.ai.option).toBe("llama-3.3-70b");
  });
  it("institution name becomes the platform name", () => expect(workspaceDefaults("Acme Academy").general.platformName).toBe("Acme Academy"));
  it("scope key", () => {
    expect(scopeKeyOf(null)).toBe("legacy");
    expect(scopeKeyOf("abc")).toBe("abc");
  });
});

describe("secrets", () => {
  const d = defaultSettings();
  it("encrypts new secrets, keeps old ones on empty, never leaves them in the section", () => {
    const first = extractSecrets("email", { ...d.email, resendApiKey: "re_abcdef1234" }, {}, encryptSecret);
    expect(first.clean.resendApiKey).toBe("");
    expect(first.changed).toEqual(["resendApiKey"]);
    const stored = first.secrets["email.resendApiKey"];
    expect(stored.hint).toBe("••••1234");
    expect(decryptSecret(stored.cipher)).toBe("re_abcdef1234");

    const second = extractSecrets("email", { ...d.email, smtpPassword: "" }, first.secrets, encryptSecret);
    expect(second.secrets).toEqual(first.secrets);
    expect(second.changed).toEqual([]);
  });
  it("store exposes only hints", () => {
    const { secrets } = extractSecrets("payments", { ...d.payments, stripe: { ...d.payments.stripe, secretKey: "sk_live_9999" } }, {}, encryptSecret);
    const store = toStore({ ...Object.fromEntries(Object.keys(d).map((k) => [k, null])), secrets, sectionUpdatedAt: { payments: "2026-01-01T00:00:00.000Z" }, audit: [] } as any, d);
    expect(store.secretHints).toEqual({ "payments.stripe.secretKey": "••••9999" });
    expect(JSON.stringify(store)).not.toContain(secrets["payments.stripe.secretKey"].cipher);
    expect(store.settings.payments.stripe.secretKey).toBe("");
    expect(store.updatedAt.general).toBe("");
    expect(store.updatedAt.payments).toBe("2026-01-01T00:00:00.000Z");
    expect(store.backups).toEqual([]);
  });
  it("secret paths", () => {
    expect(isSecretPath("integrations.zoom.apiKey")).toBe(true);
    expect(isSecretPath("integrations.zoom.accountLabel")).toBe(false);
    expect(isSecretPath("nope.x")).toBe(false);
  });
});

describe("audit", () => {
  it("changed fields with panel wording", () => {
    const d = defaultSettings();
    const keys = changedKeys(d.general as any, { ...d.general, platformName: "X", timezone: "UTC" } as any);
    expect(keys.map(humanize)).toEqual(["Platform Name", "Timezone"]);
    expect(changedKeys(d.integrations as any, { ...d.integrations, zoom: { ...d.integrations.zoom, connected: true } } as any).map(humanize)).toEqual(["Zoom connected"]);
    expect(humanize("websiteUrl")).toBe("Website URL");
  });
  it("summary", () => {
    expect(auditSummary([])).toBeNull();
    expect(auditSummary(["A", "B"])).toBe("A, B");
    expect(auditSummary(["A", "B", "C", "D", "E", "F"])).toBe("A, B, C, D +2 more");
  });
});

describe("public settings", () => {
  it("hides the maintenance message when maintenance is off", () => {
    const p = toPublic(defaultSettings());
    expect(p.maintenance).toEqual({ enabled: false, message: "", until: "" });
    expect(Object.keys(p)).not.toContain("payments");
  });
});

describe("requireAdmin2fa policy", () => {
  const base = { requireAdmin2fa: true, role: "ADMIN", twoFactorEnabled: false, isOwner: false, impersonatedBy: null };
  it("reads the stored setting (default off)", () => {
    expect(requireAdmin2faOf(null)).toBe(false);
    expect(requireAdmin2faOf({ requireAdmin2fa: true })).toBe(true);
  });
  it("blocks staff without 2FA only when required", () => {
    expect(mustSetUpTwoFactor(base)).toBe(true);
    expect(mustSetUpTwoFactor({ ...base, requireAdmin2fa: false })).toBe(false);
    expect(mustSetUpTwoFactor({ ...base, twoFactorEnabled: true })).toBe(false);
  });
  it("never locks out the owner, impersonation or non-staff", () => {
    expect(mustSetUpTwoFactor({ ...base, isOwner: true })).toBe(false);
    expect(mustSetUpTwoFactor({ ...base, impersonatedBy: "owner-1" })).toBe(false);
    expect(mustSetUpTwoFactor({ ...base, role: "SUPER_ADMIN" })).toBe(false);
    expect(mustSetUpTwoFactor({ ...base, role: "STUDENT" })).toBe(false);
  });
});
