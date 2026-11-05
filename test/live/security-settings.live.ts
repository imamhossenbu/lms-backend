/**
 * API test of Settings › Security enforcement in a tagged test workspace: password policy on change-password
 * (and generated passwords for admin-created students), login lockout after N wrong passwords, password expiry,
 * admin IP allowlist (students unaffected) and the admin idle-session timeout. Never touches real workspaces.
 * API on :4077 by default (LIVE_API_URL); it sees this script as 127.0.0.1. Cleanup in `finally`.
 */
import { check, cleanup, mkInstitution, mkUser, newTag, prisma as p, report, result, type Ids } from "./panel-e2e-helpers";

const API = process.env.LIVE_API_URL ?? "http://localhost:4077";
const tag = newTag();
async function api(token: string | null, method: string, path: string, body?: unknown) {
  const res = await fetch(`${API}${path}`, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: (await res.json().catch(() => null)) as any };
}
const login = (email: string, password = "Admin12345") => api(null, "POST", "/auth/login", { email, password });
const msg = (r: { body: any }) => [r.body?.message].flat().join(" ");

(async () => {
  const ids: Ids = { users: [], insts: [] };
  try {
    const inst = await mkInstitution(ids, tag);
    const admin = await mkUser(ids, tag, "Sec Admin", "ADMIN", inst.id);
    const admin2 = await mkUser(ids, tag, "Sec Admin Two", "ADMIN", inst.id);
    const student = await mkUser(ids, tag, "Sec Student", "STUDENT", inst.id);
    const t = (await login(admin.email)).body?.token as string;
    check("admin signs in", !!t);

    const store = await api(t, "GET", "/admin/settings");
    const base = store.body?.settings?.security;
    // Each save builds on the previous one (the endpoint replaces the whole section).
    let current: Record<string, unknown> = { ...base, requireAdmin2fa: false };
    const saveSecurity = (patch: Record<string, unknown>) => {
      current = { ...current, ...patch };
      return api(t, "PATCH", "/admin/settings/security", current);
    };
    const saved = await saveSecurity({ passwordMinLength: 12, requireUppercase: true, requireNumber: true, requireSymbol: true, maxLoginAttempts: 3, lockoutMinutes: 15, passwordExpiryDays: null, sessionTimeoutMinutes: 5, ipAllowlistEnabled: false, ipAllowlist: [] });
    check("security settings saved", saved.status === 200, msg(saved));

    // ---------------------------------------------------------------- password policy
    const st = (await login(student.email)).body?.token as string;
    const weak = await api(st, "PATCH", "/user/change-password", { currentPassword: "Admin12345", newPassword: "weakpassword1" });
    check("weak new password is refused with the policy's reasons", weak.status === 400 && /at least 12 characters|uppercase|symbol/.test(msg(weak)), msg(weak));
    const strong = await api(st, "PATCH", "/user/change-password", { currentPassword: "Admin12345", newPassword: "Strong#Pass2026" });
    const afterChange = await p.user.findUnique({ where: { id: student.id }, select: { passwordChangedAt: true } });
    check("a password that meets the policy is accepted (and dated)", strong.status === 200 && Date.now() - afterChange.passwordChangedAt.getTime() < 60_000, msg(strong));
    const created = await api(t, "POST", "/students", { name: `Gen Student ${tag}`, email: `${tag}-gen@example.com`, courseIds: [] });
    check("admin-created students still work (generated password fits the policy)", created.status === 201, { s: created.status, m: msg(created) });

    // ---------------------------------------------------------------- lockout
    const w1 = await login(student.email, "wrong-1");
    const w2 = await login(student.email, "wrong-2");
    const w3 = await login(student.email, "wrong-3");
    check("third wrong password locks the account", w1.status === 401 && /Invalid credentials/.test(msg(w1)) && w2.status === 401 && w3.status === 401 && /locked for 15 minutes/.test(msg(w3)), [msg(w1), msg(w3)]);
    const whileLocked = await login(student.email, "Strong#Pass2026");
    check("even the right password is refused while locked", whileLocked.status === 401 && /Try again in 15 minutes/.test(msg(whileLocked)), msg(whileLocked));
    await p.user.update({ where: { id: student.id }, data: { lockedUntil: new Date(Date.now() - 1000) } });
    const unlocked = await login(student.email, "Strong#Pass2026");
    const row = await p.user.findUnique({ where: { id: student.id }, select: { failedLoginAttempts: true, lockedUntil: true } });
    check("after the lock ends the right password works and resets the counter", unlocked.status === 201 && !!unlocked.body?.token && row.failedLoginAttempts === 0 && row.lockedUntil === null, { s: unlocked.status, row });

    // ---------------------------------------------------------------- expiry
    await saveSecurity({ passwordMinLength: 12, requireUppercase: true, requireNumber: true, requireSymbol: true, maxLoginAttempts: 3, lockoutMinutes: 15, passwordExpiryDays: 30, sessionTimeoutMinutes: 5 });
    await p.user.update({ where: { id: student.id }, data: { passwordChangedAt: new Date(Date.now() - 40 * 864e5) } });
    const expired = await login(student.email, "Strong#Pass2026");
    check("a password older than the expiry is refused", expired.status === 401 && /expired/.test(msg(expired)), msg(expired));
    const freshAdmin = await login(admin2.email);
    check("recent passwords still sign in with expiry on", freshAdmin.status === 201, msg(freshAdmin));

    // ---------------------------------------------------------------- IP allowlist
    await saveSecurity({ passwordExpiryDays: null, ipAllowlistEnabled: true, ipAllowlist: ["10.99.0.0/16"] });
    await p.user.update({ where: { id: student.id }, data: { passwordChangedAt: new Date() } });
    const blocked = await login(admin2.email);
    check("admin sign-in from an unlisted IP is refused (403)", blocked.status === 403 && /network/.test(msg(blocked)), { s: blocked.status, m: msg(blocked) });
    const studentOk = await login(student.email, "Strong#Pass2026");
    check("students aren't affected by the admin IP allowlist", studentOk.status === 201, msg(studentOk));
    await saveSecurity({ passwordExpiryDays: null, ipAllowlistEnabled: true, ipAllowlist: ["10.99.0.0/16", "127.0.0.1"] });
    const allowed = await login(admin2.email);
    check("listed IP signs in", allowed.status === 201, msg(allowed));

    // ---------------------------------------------------------------- idle timeout (5 minutes)
    const t2 = allowed.body?.token as string;
    await p.user.update({ where: { id: admin2.id }, data: { lastActiveAt: new Date(Date.now() - 10 * 60_000) } });
    const idle = await api(t2, "GET", "/admin/settings");
    check("an admin idle past the timeout is signed out (401)", idle.status === 401 && /inactivity/.test(msg(idle)), { s: idle.status, m: msg(idle) });
    const again = await login(admin2.email);
    const active = await api(again.body?.token, "GET", "/admin/settings");
    check("signing in again starts a new session", active.status === 200, active.status);
    const stIdle = unlocked.body?.token as string;
    await p.user.update({ where: { id: student.id }, data: { lastActiveAt: new Date(Date.now() - 10 * 60_000) } });
    const stStill = await api(stIdle, "GET", "/user/profile");
    check("students aren't signed out by the admin idle timeout", stStill.status !== 401, stStill.status);

    await saveSecurity({ ipAllowlistEnabled: false, ipAllowlist: [] });
  } catch (e) {
    console.log("FAIL exception", (e as Error).message || String(e).slice(0, 400));
    result.bad++;
  } finally {
    await cleanup(ids, tag, async () => {
      await p.workspaceSettings.deleteMany({ where: { institutionId: { in: ids.insts } } });
    });
    await report(tag, `, (select count(*)::int from workspace_settings where "institutionId" in (${ids.insts.map((i) => `'${i}'`).join(",") || "''"})) settings`);
  }
})();
