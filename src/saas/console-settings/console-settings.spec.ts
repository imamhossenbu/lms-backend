import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validateSync, type ValidationError } from "class-validator";
import { taxFor } from "../saas.math";
import { defaultConsoleSettings } from "./console-settings.constants";
import { consoleSettingsErrors, extractConsoleSecrets, mergeConsoleSection, toConsoleSettingsStore } from "./console-settings.rules";
import { BillingSettingsDto, CompanySettingsDto, TrialsSettingsDto } from "./dto/console-settings.dto";

const flat = (errs: ValidationError[]): string[] => errs.flatMap((e) => [...Object.values(e.constraints ?? {}), ...flat(e.children ?? [])]);
const messages = (cls: new () => object, body: object) => flat(validateSync(plainToInstance(cls, body) as object, { whitelist: true }));

const gw = (over = {}) => ({ enabled: true, mode: "LIVE", publicKey: "pk_live_x", secretKey: "", ...over });
const billing = (over = {}) => ({ currency: "USD", taxRate: 5, invoicePrefix: "edp", invoiceFooter: "", stripe: gw(), sslcommerz: gw({ enabled: false, publicKey: "" }), bkash: gw({ enabled: false, publicKey: "" }), ...over });

describe("console settings DTOs (consoleSettingsSchema messages)", () => {
  it("company", () => {
    const ok = { legalName: "EduPro Ltd", address: "Dhaka 1212", supportEmail: "b@edupro.com", website: "", taxId: "", logoUrl: "" };
    expect(messages(CompanySettingsDto, ok)).toEqual([]);
    expect(messages(CompanySettingsDto, { ...ok, legalName: "E" })).toContain("Legal name must be at least 2 characters");
    expect(messages(CompanySettingsDto, { ...ok, supportEmail: "nope" })).toContain("Enter a valid email address");
    expect(messages(CompanySettingsDto, { ...ok, website: "edupro.com" })).toContain("Enter a full URL starting with https://");
  });

  it("billing upper-cases the prefix and validates nested gateways", () => {
    const dto = plainToInstance(BillingSettingsDto, billing());
    expect(flat(validateSync(dto))).toEqual([]);
    expect(dto.invoicePrefix).toBe("EDP");
    expect(messages(BillingSettingsDto, billing({ invoicePrefix: "E1" }))).toContain("Use 2–6 capital letters, e.g. EDP");
    expect(messages(BillingSettingsDto, billing({ taxRate: 31 }))).toContain("Tax can be at most 30%");
    expect(messages(BillingSettingsDto, billing({ stripe: gw({ publicKey: "x".repeat(201) }) }))).toContain("Key is too long");
  });

  it("trials", () => {
    const ok = { defaultTrialDays: 14, requireCardForTrial: false, gracePeriodDays: 7, retryScheduleDays: [1, 3, 7], suspendAfterGrace: true };
    expect(messages(TrialsSettingsDto, ok)).toEqual([]);
    expect(messages(TrialsSettingsDto, { ...ok, defaultTrialDays: 91 })).toContain("Trials can be at most 90 days");
    expect(messages(TrialsSettingsDto, { ...ok, retryScheduleDays: [] })).toContain("Add at least one retry");
  });
});

describe("console settings rules", () => {
  it("cross-field rules copy the superRefine messages", () => {
    const b = defaultConsoleSettings().billing;
    expect(consoleSettingsErrors("billing", b)).toEqual(["Enable at least one gateway to collect subscription fees"]);
    expect(consoleSettingsErrors("billing", { ...b, stripe: { ...b.stripe, enabled: true } })).toContain("Add the public key before enabling this gateway");
    const t = { ...defaultConsoleSettings().trials, gracePeriodDays: 5 };
    expect(consoleSettingsErrors("trials", t)).toEqual(["The last retry (day 7) is after the 5-day grace period"]);
    expect(consoleSettingsErrors("trials", { ...t, suspendAfterGrace: false })).toEqual([]);
  });

  it("encrypts non-empty secrets, keeps stored ones on empty and never echoes them", () => {
    const values = { ...defaultConsoleSettings().billing, stripe: { enabled: true, mode: "LIVE" as const, publicKey: "pk", secretKey: "sk_live_abcd4e19" } };
    const stored = { "billing.bkash.secretKey": { cipher: "old", hint: "••••9999" } };
    const { clean, secrets, changed } = extractConsoleSecrets("billing", values, stored, (p) => `enc(${p})`);
    expect(clean.stripe.secretKey).toBe("");
    expect(secrets["billing.stripe.secretKey"]).toEqual({ cipher: "enc(sk_live_abcd4e19)", hint: "••••4e19" });
    expect(secrets["billing.bkash.secretKey"]).toEqual(stored["billing.bkash.secretKey"]);
    expect(changed).toEqual(["billing.stripe.secretKey"]);

    const store = toConsoleSettingsStore({ billing: { ...values }, secrets, sectionUpdatedAt: { billing: "2026-11-03T00:00:00.000Z" } });
    expect(store.settings.billing.stripe.secretKey).toBe("");
    expect(store.secretHints).toEqual({ "billing.stripe.secretKey": "••••4e19", "billing.bkash.secretKey": "••••9999" });
    expect(store.updatedAt).toEqual({ company: "", billing: "2026-11-03T00:00:00.000Z", trials: "", email: "" });
  });

  it("merges stored JSON over defaults", () => {
    expect(mergeConsoleSection("trials", { defaultTrialDays: 30 }).gracePeriodDays).toBe(7);
    expect(mergeConsoleSection("trials", null).defaultTrialDays).toBe(14);
    expect(mergeConsoleSection("billing", { stripe: { publicKey: "pk" } }).stripe).toEqual({ enabled: false, mode: "TEST", publicKey: "pk", secretKey: "" });
  });

  it("billing tax rate is the fallback for countries without a specific rate", () => {
    expect(taxFor("Bangladesh", 100, 10)).toBe(5);
    expect(taxFor("Nepal", 100, 10)).toBe(10);
    expect(taxFor("Nepal", 100)).toBe(0);
  });
});
