/**
 * Settings › Security enforcement — pure decisions (no I/O) used by SecurityPolicyService, login and the JWT
 * strategy: password policy, password expiry, login lockout, admin IP allowlist and the admin idle timeout.
 */
import type { SecuritySettings } from "./workspace-settings.types";

const SYMBOL_RE = /[^A-Za-z0-9]/;

/** Human, English reasons a password breaks the workspace policy ([] = fine). */
export function passwordPolicyErrors(password: string, s: Pick<SecuritySettings, "passwordMinLength" | "requireUppercase" | "requireNumber" | "requireSymbol">): string[] {
  const errors: string[] = [];
  if (password.length < s.passwordMinLength) errors.push(`Password must be at least ${s.passwordMinLength} characters long.`);
  if (s.requireUppercase && !/[A-Z]/.test(password)) errors.push("Password must include an uppercase letter.");
  if (s.requireNumber && !/[0-9]/.test(password)) errors.push("Password must include a number.");
  if (s.requireSymbol && !SYMBOL_RE.test(password)) errors.push("Password must include a symbol (e.g. ! @ # $).");
  return errors;
}

/** true when expiry is on and the password is older than `passwordExpiryDays`. */
export function isPasswordExpired(changedAt: Date | null | undefined, expiryDays: number | null, now = new Date()): boolean {
  if (!expiryDays || !changedAt) return false;
  return now.getTime() - changedAt.getTime() > expiryDays * 86_400_000;
}

/** Whole minutes left on a lock (≥ 1), or 0 when the account isn't locked. */
export function lockMinutesLeft(lockedUntil: Date | null | undefined, now = new Date()): number {
  if (!lockedUntil || lockedUntil.getTime() <= now.getTime()) return 0;
  return Math.max(1, Math.ceil((lockedUntil.getTime() - now.getTime()) / 60_000));
}

/**
 * What a wrong password does: the new failure count, and the lock end when it reaches `maxLoginAttempts`
 * (the count then starts again from 0).
 */
export function afterFailedLogin(failedSoFar: number, s: Pick<SecuritySettings, "maxLoginAttempts" | "lockoutMinutes">, now = new Date()): { failedLoginAttempts: number; lockedUntil: Date | null } {
  const failed = failedSoFar + 1;
  if (failed >= s.maxLoginAttempts) return { failedLoginAttempts: 0, lockedUntil: new Date(now.getTime() + s.lockoutMinutes * 60_000) };
  return { failedLoginAttempts: failed, lockedUntil: null };
}

const ipToInt = (ip: string): number | null => {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p) || Number(p) > 255) return null;
    n = n * 256 + Number(p);
  }
  return n;
};

/** Normalises "::ffff:1.2.3.4" (IPv4-mapped IPv6) and "::1" to IPv4. */
export const normalizeIp = (ip: string | null | undefined): string => {
  const v = (ip ?? "").trim().replace(/^::ffff:/i, "");
  return v === "::1" ? "127.0.0.1" : v;
};

/** Does `ip` match one of the IPv4 addresses / CIDR ranges? Unknown or IPv6 addresses never match. */
export function ipInList(ip: string | null | undefined, list: string[]): boolean {
  const n = ipToInt(normalizeIp(ip));
  if (n === null) return false;
  return list.some((entry) => {
    const [base, bitsRaw] = entry.trim().split("/");
    const b = ipToInt(base);
    if (b === null) return false;
    const bits = bitsRaw === undefined ? 32 : Number(bitsRaw);
    if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
    const size = 2 ** (32 - bits);
    return Math.floor(n / size) === Math.floor(b / size);
  });
}

/** Admin sign-in allowed from `ip`? (only checked when the allowlist is on and has entries). */
export function adminIpAllowed(ip: string | null | undefined, s: Pick<SecuritySettings, "ipAllowlistEnabled" | "ipAllowlist">): boolean {
  if (!s.ipAllowlistEnabled || s.ipAllowlist.length === 0) return true;
  return ipInList(ip, s.ipAllowlist);
}

/** Has an admin been idle longer than the session timeout? (no activity recorded yet = not idle) */
export function isIdleExpired(lastActiveAt: Date | null | undefined, timeoutMinutes: number, now = new Date()): boolean {
  if (!lastActiveAt || !timeoutMinutes) return false;
  return now.getTime() - lastActiveAt.getTime() > timeoutMinutes * 60_000;
}
