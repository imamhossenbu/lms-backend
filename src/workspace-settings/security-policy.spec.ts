import { adminIpAllowed, afterFailedLogin, ipInList, isIdleExpired, isPasswordExpired, lockMinutesLeft, maintenanceActive, normalizeIp, passwordPolicyErrors } from "./security-policy";

const NOW = new Date("2026-11-05T10:00:00Z");
const policy = { passwordMinLength: 10, requireUppercase: true, requireNumber: true, requireSymbol: true };

describe("Settings › Security enforcement (pure rules)", () => {
  it("password policy lists every broken rule", () => {
    expect(passwordPolicyErrors("short", policy)).toEqual([
      "Password must be at least 10 characters long.",
      "Password must include an uppercase letter.",
      "Password must include a number.",
      "Password must include a symbol (e.g. ! @ # $).",
    ]);
    expect(passwordPolicyErrors("Longer#Pass1", policy)).toEqual([]);
    expect(passwordPolicyErrors("plainpassword", { passwordMinLength: 8, requireUppercase: false, requireNumber: false, requireSymbol: false })).toEqual([]);
  });

  it("password expiry counts days from the last change", () => {
    expect(isPasswordExpired(new Date("2026-10-01T00:00:00Z"), 30, NOW)).toBe(true);
    expect(isPasswordExpired(new Date("2026-10-20T00:00:00Z"), 30, NOW)).toBe(false);
    expect(isPasswordExpired(new Date("2020-01-01T00:00:00Z"), null, NOW)).toBe(false);
  });

  it("locks after the max failed attempts and reports minutes left", () => {
    const s = { maxLoginAttempts: 3, lockoutMinutes: 15 };
    expect(afterFailedLogin(0, s, NOW)).toEqual({ failedLoginAttempts: 1, lockedUntil: null });
    expect(afterFailedLogin(2, s, NOW)).toEqual({ failedLoginAttempts: 0, lockedUntil: new Date(NOW.getTime() + 15 * 60_000) });
    expect(lockMinutesLeft(new Date(NOW.getTime() + 61_000), NOW)).toBe(2);
    expect(lockMinutesLeft(new Date(NOW.getTime() - 1), NOW)).toBe(0);
    expect(lockMinutesLeft(null, NOW)).toBe(0);
  });

  it("IP allowlist matches addresses and CIDR ranges (IPv4-mapped too)", () => {
    expect(normalizeIp("::ffff:10.1.2.3")).toBe("10.1.2.3");
    expect(normalizeIp("::1")).toBe("127.0.0.1");
    expect(ipInList("10.1.2.3", ["10.1.0.0/16"])).toBe(true);
    expect(ipInList("10.2.2.3", ["10.1.0.0/16"])).toBe(false);
    expect(ipInList("::ffff:203.0.113.7", ["203.0.113.7"])).toBe(true);
    expect(ipInList("1.2.3.4", ["0.0.0.0/0"])).toBe(true);
    expect(ipInList("fe80::1", ["10.0.0.0/8"])).toBe(false);
    expect(adminIpAllowed("8.8.8.8", { ipAllowlistEnabled: false, ipAllowlist: ["10.0.0.0/8"] })).toBe(true);
    expect(adminIpAllowed("8.8.8.8", { ipAllowlistEnabled: true, ipAllowlist: [] })).toBe(true);
    expect(adminIpAllowed("8.8.8.8", { ipAllowlistEnabled: true, ipAllowlist: ["10.0.0.0/8"] })).toBe(false);
  });

  it("idle timeout only after the configured minutes of inactivity", () => {
    expect(isIdleExpired(new Date(NOW.getTime() - 121 * 60_000), 120, NOW)).toBe(true);
    expect(isIdleExpired(new Date(NOW.getTime() - 119 * 60_000), 120, NOW)).toBe(false);
    expect(isIdleExpired(null, 120, NOW)).toBe(false);
  });
});

describe("maintenanceActive", () => {
  const at = new Date("2026-11-05T10:00:00Z"); // 16:00 in Dhaka
  it("off, on without an end, and ended / not ended", () => {
    expect(maintenanceActive({ maintenanceMode: false, maintenanceUntil: "" }, at)).toBe(false);
    expect(maintenanceActive({ maintenanceMode: true, maintenanceUntil: "" }, at)).toBe(true);
    expect(maintenanceActive({ maintenanceMode: true, maintenanceUntil: "2026-11-05T09:00:00Z" }, at)).toBe(false);
    expect(maintenanceActive({ maintenanceMode: true, maintenanceUntil: "2026-11-05T11:00:00+00:00" }, at)).toBe(true);
    expect(maintenanceActive({ maintenanceMode: true, maintenanceUntil: "2026-11-05T15:00" }, at)).toBe(false);
    expect(maintenanceActive({ maintenanceMode: true, maintenanceUntil: "2026-11-05T17:00" }, at)).toBe(true);
    expect(maintenanceActive({ maintenanceMode: true, maintenanceUntil: "2026-11-05" }, at)).toBe(true);
    expect(maintenanceActive({ maintenanceMode: true, maintenanceUntil: "2026-11-04" }, at)).toBe(false);
  });
});
