/**
 * Browser E2E for the admin panel auth step: 2FA login, permission-based sidebar, accept-invite page,
 * and the "workspace requires 2FA" redirect. Panel on :3010, API on :4077. Test data removed in `finally`.
 */
import "dotenv/config";
import * as bcrypt from "bcrypt";
import { createHash } from "crypto";
import { JwtService } from "@nestjs/jwt";
import { authenticator } from "otplib";
import puppeteer, { type Page } from "puppeteer-core";
import { PrismaService } from "../../src/prisma/prisma.service";

const API = process.env.LIVE_API_URL ?? "http://localhost:4077";
const PANEL = process.env.LIVE_PANEL_URL ?? "http://localhost:3010";
const SHOTS = process.env.LIVE_SHOTS_DIR ?? require("os").tmpdir();
const p: any = new PrismaService();
const jwt = new JwtService({ secret: process.env.SUPER_SECRET_KEY });
const tag = `e2e-${Date.now()}`;
let ok = 0, bad = 0;
const check = (name: string, cond: boolean, extra?: unknown) => {
  cond ? ok++ : bad++;
  console.log(cond ? "PASS" : "FAIL", name, cond ? "" : JSON.stringify(extra)?.slice(0, 300));
};
const api = async (token: string | null, method: string, path: string, body?: unknown) => {
  const r = await fetch(API + path, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const text = (page: Page) => page.evaluate(() => document.body.innerText);
const waitForText = async (page: Page, needle: string, timeout = 20000) => {
  await page.waitForFunction((n) => document.body.innerText.includes(n), { timeout }, needle);
};

async function login(page: Page, email: string, password: string) {
  await page.goto(`${PANEL}/login`, { waitUntil: "networkidle2" });
  await page.waitForSelector("#email-address");
  for (const [sel, value] of [["#email-address", email], ["#password-field", password]] as const) {
    await page.click(sel, { clickCount: 3 });
    await page.keyboard.press("Backspace");
    await page.type(sel, value);
  }
  await page.click('button[type="submit"]');
}

async function typeCode(page: Page, code: string) {
  const inputs = await page.$$('input[inputmode="numeric"]');
  await inputs[0].click();
  for (const d of code) await page.keyboard.type(d);
}

(async () => {
  const ids: any = { users: [] as string[], inst: null as string | null };
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--no-first-run"] });
  try {
    // ---------------------------------------------------------------- seed an isolated workspace
    const plan = await p.saasPlan.findFirst({ where: { id: "pro" } });
    const inst = await p.institution.create({ data: { name: "E2E Academy", slug: tag, logoInitials: "EA", type: "SCHOOL", country: "Bangladesh", ownerName: "E2E", ownerEmail: `${tag}@example.com`, planId: plan.id, status: "ACTIVE", currentPeriodStart: new Date(), currentPeriodEnd: new Date(Date.now() + 30 * 864e5) } });
    ids.inst = inst.id;
    const mk = async (n: string, password: string, ageDays: number) => {
      const u = await p.user.create({ data: { name: `E2E ${n}`, email: `${tag}-${n}@example.com`, password: await bcrypt.hash(password, 10), role: "ADMIN", status: "ACTIVE", emailVerified: true, institutionId: inst.id, createdAt: new Date(Date.now() - ageDays * 864e5) } });
      ids.users.push(u.id);
      return u;
    };
    const owner = await mk("owner", "Owner12345", 10);
    const support = await mk("support", "Support123", 5);
    const TO = jwt.sign({ sub: owner.id, email: owner.email, role: "ADMIN", institutionId: inst.id }, { expiresIn: "20m" });
    await api(TO, "GET", "/team/me"); // bootstrap: owner = Super Admin, support = Admin
    const roles = (await api(TO, "GET", "/team")).body.roles;
    const supportMember = await p.teamMember.findUnique({ where: { userId: support.id } });
    await api(TO, "PATCH", `/team/members/${supportMember.id}`, { roleId: roles.find((r: any) => r.name === "Support").id });
    const setup = (await api(TO, "POST", "/auth/2fa/setup")).body;
    await api(TO, "POST", "/auth/2fa/enable", { code: authenticator.generate(setup.secret) });
    const inv = (await api(TO, "POST", "/team/invitations", { emails: [`${tag}-new@example.com`], roleId: roles.find((r: any) => r.name === "Support").id, message: "Welcome to the team!" })).body[0];
    const inviteToken = `e2e-known-${tag}-invite-token`;
    await p.teamMember.update({ where: { id: inv.id }, data: { inviteTokenHash: createHash("sha256").update(inviteToken).digest("hex") } });

    // ---------------------------------------------------------------- 1. owner: password → 2FA code → dashboard
    let ctx = await browser.createBrowserContext();
    let page = await ctx.newPage();
    await page.setViewport({ width: 1400, height: 900 });
    await login(page, owner.email, "Owner12345");
    await waitForText(page, "Two-factor authentication");
    check("2FA step appears after the password", (await text(page)).includes("Verify it's you"));
    await page.screenshot({ path: `${SHOTS}/1-2fa-step.png` });
    await typeCode(page, "000000");
    await page.click('button[type="submit"]');
    await waitForText(page, "didn't match");
    check("wrong code shows a friendly error", true);
    await page.reload({ waitUntil: "networkidle2" }); // back to the password step
    await login(page, owner.email, "Owner12345");
    await waitForText(page, "Two-factor authentication");
    await typeCode(page, authenticator.generate(setup.secret));
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => location.pathname === "/", { timeout: 20000 });
    await waitForText(page, "Team & Roles");
    const ownerNav = await text(page);
    check("owner reaches the dashboard after 2FA", true);
    check("owner sidebar shows Team & Roles and Settings", ownerNav.includes("Team & Roles") && ownerNav.includes("Settings"), ownerNav.slice(0, 300));
    await page.screenshot({ path: `${SHOTS}/2-owner-dashboard.png` });
    await page.goto(`${PANEL}/settings?section=security`, { waitUntil: "networkidle2" });
    await waitForText(page, "Your two-factor authentication");
    await page.waitForFunction(() => document.body.innerText.includes("Turn off"), { timeout: 20000 });
    check("Settings › Security shows my 2FA as On", (await text(page)).includes("Turn off"));
    await page.screenshot({ path: `${SHOTS}/3-security-2fa-on.png` });
    await ctx.close();

    // ---------------------------------------------------------------- 2. Support: permission-based sidebar
    ctx = await browser.createBrowserContext();
    page = await ctx.newPage();
    await page.setViewport({ width: 1400, height: 900 });
    await login(page, support.email, "Support123");
    await page.waitForFunction(() => location.pathname === "/", { timeout: 20000 });
    await waitForText(page, "Students");
    await new Promise((r) => setTimeout(r, 1500)); // /team/me lands after the profile
    const supportNav = await text(page);
    check("Support sidebar keeps Students", supportNav.includes("Students"));
    check("Support sidebar hides Team & Roles, Settings, Analytics", !supportNav.includes("Team & Roles") && !/\nSettings\n/.test(`\n${supportNav}\n`) && !supportNav.includes("Analytics"), supportNav.slice(0, 400));
    await page.screenshot({ path: `${SHOTS}/4-support-sidebar.png` });
    await ctx.close();

    // ---------------------------------------------------------------- 3. accept-invite page
    ctx = await browser.createBrowserContext();
    page = await ctx.newPage();
    await page.setViewport({ width: 1400, height: 900 });
    await page.goto(`${PANEL}/accept-invite?token=nope-${tag}-0000000000`, { waitUntil: "networkidle2" });
    await waitForText(page, "isn't valid");
    check("invalid invitation link shows the error card", true);
    await page.goto(`${PANEL}/accept-invite?token=${inviteToken}`, { waitUntil: "networkidle2" });
    await waitForText(page, "E2E Academy");
    const inviteText = await text(page);
    check("invite preview: workspace, role, inviter, message", inviteText.includes("Support") && inviteText.includes("E2E owner") && inviteText.includes("Welcome to the team!"), inviteText.slice(0, 400));
    await page.type("#invite-name", "E2E Newbie");
    await page.type("#invite-password", "short");
    await page.type("#invite-confirm", "different");
    await page.click('button[type="submit"]');
    await waitForText(page, "Passwords don't match");
    check("accept form validates (password rules + match)", (await text(page)).includes("at least 8 characters"));
    await page.screenshot({ path: `${SHOTS}/5-accept-validation.png` });
    for (const [sel, v] of [["#invite-password", "Newbie12345"], ["#invite-confirm", "Newbie12345"]] as const) {
      await page.click(sel, { clickCount: 3 });
      await page.keyboard.press("Backspace");
      await page.type(sel, v);
    }
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => location.pathname === "/login", { timeout: 20000 });
    await page.waitForSelector("#email-address");
    await new Promise((r) => setTimeout(r, 500));
    const prefilled = await page.$eval("#email-address", (el) => (el as HTMLInputElement).value);
    check("after accepting: login opens with the email prefilled", prefilled === `${tag}-new@example.com`, prefilled);
    const joined = await p.teamMember.findUnique({ where: { id: inv.id } });
    check("member is ACTIVE in the database", joined?.status === "ACTIVE");
    if (joined?.userId) ids.users.push(joined.userId);
    await ctx.close();

    // ---------------------------------------------------------------- 4. workspace requires 2FA → redirect + setup modal
    const settings = (await api(TO, "GET", "/admin/settings")).body;
    const security = settings.settings?.security ?? settings.security;
    const sec = await api(TO, "PATCH", "/admin/settings/security", { ...security, requireAdmin2fa: true });
    check("owner turns on 'require 2FA for admins'", sec.status === 200, sec.body);
    ctx = await browser.createBrowserContext();
    page = await ctx.newPage();
    await page.setViewport({ width: 1400, height: 900 });
    await login(page, support.email, "Support123");
    await page.waitForFunction(() => location.pathname === "/settings" && location.search.includes("section=security"), { timeout: 20000 });
    check("admin without 2FA is sent to Settings › Security", true);
    await page.waitForSelector('img[alt="QR code for your authenticator app"]', { timeout: 20000 });
    check("setup modal opens automatically with a QR code", true);
    check("header shows the real team role (Support)", (await text(page)).includes("Support"));
    await page.screenshot({ path: `${SHOTS}/6-required-2fa-setup.png` });
    await ctx.close();
  } catch (e) {
    console.log("FAIL exception", (e as Error).message);
    bad++;
  } finally {
    await browser.close();
    if (ids.inst) {
      for (const t of ["teamEvent", "teamMember", "teamRole"]) await p[t].deleteMany({ where: { institutionId: ids.inst } });
      await p.workspaceSettings.deleteMany({ where: { institutionId: ids.inst } }).catch(() => {});
      await p.activityLog.deleteMany({ where: { userId: { in: ids.users } } });
      await p.user.deleteMany({ where: { OR: [{ id: { in: ids.users } }, { email: { startsWith: tag } }] } });
      await p.institution.deleteMany({ where: { id: ids.inst } });
    }
    const left = await p.$queryRawUnsafe(`select (select count(*)::int from "User" where email like '${tag}%') users, (select count(*)::int from institutions where slug = '${tag}') insts`);
    console.log(`\n${ok} passed, ${bad} failed | leftovers ${JSON.stringify(left)}`);
    await p.$disconnect();
  }
})();
