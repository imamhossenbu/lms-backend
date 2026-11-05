/**
 * Browser E2E for the Owner Console against the real API: sign-in (wrong password, non-owner, owner),
 * snapshot-driven pages, create institution, notes, coupons, console settings, alerts read-state,
 * "Open as owner" into the admin panel, and an expired session. Console on :3011, panel on :3010, API on :4077.
 * Everything created is removed in `finally`.
 */
import "dotenv/config";
import * as bcrypt from "bcrypt";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { PrismaService } from "../../src/prisma/prisma.service";

const API = process.env.LIVE_API_URL ?? "http://localhost:4077";
const CONSOLE = process.env.LIVE_CONSOLE_URL ?? "http://localhost:3011";
const PANEL = process.env.LIVE_PANEL_URL ?? "http://localhost:3010";
const SHOTS = process.env.LIVE_SHOTS_DIR ?? require("os").tmpdir();
const p: any = new PrismaService();
const tag = `e2econ${Date.now().toString(36)}`;
let ok = 0, bad = 0;
const check = (name: string, cond: boolean, extra?: unknown) => {
  cond ? ok++ : bad++;
  console.log(cond ? "PASS" : "FAIL", name, cond ? "" : JSON.stringify(extra)?.slice(0, 300));
};
const text = (page: Page) => page.evaluate(() => document.body.innerText);
const waitForText = (page: Page, needle: string, timeout = 25000) => page.waitForFunction((n) => document.body.innerText.includes(n), { timeout }, needle);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fill(page: Page, selector: string, value: string) {
  await page.waitForSelector(selector);
  // Triple-click doesn't always select the whole value (e.g. an auto-filled slug); select() does.
  await page.click(selector);
  await page.$eval(selector, (e) => (e as HTMLInputElement).select());
  await page.keyboard.press("Backspace");
  await page.type(selector, value);
}

async function clickText(page: Page, label: string, selector = "button") {
  const ok = await page.evaluate(
    (sel, l) => {
      const el = [...document.querySelectorAll<HTMLElement>(sel)].find((b) => b.innerText.trim() === l && !(b as HTMLButtonElement).disabled);
      el?.click();
      return !!el;
    },
    selector,
    label,
  );
  if (!ok) throw new Error(`No clickable "${label}"`);
}

async function consoleLogin(page: Page, email: string, password: string) {
  await page.goto(`${CONSOLE}/login`, { waitUntil: "networkidle2" });
  await fill(page, "#console-email", email);
  await fill(page, "#console-password", password);
  await page.click('button[type="submit"]');
}

(async () => {
  const ids = { users: [] as string[], inst: null as string | null };
  const browser: Browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--no-first-run"] });
  const settingsBefore = await p.consoleSettings.findFirst();
  try {
    const mk = async (n: string, role: string, password: string) => {
      const u = await p.user.create({ data: { name: `E2E ${n}`, email: `${tag}-${n}@example.com`, password: await bcrypt.hash(password, 10), role, status: "ACTIVE", emailVerified: true } });
      ids.users.push(u.id);
      return u;
    };
    const owner = await mk("owner", "SUPER_ADMIN", "Owner12345");
    const notOwner = await mk("admin", "ADMIN", "Admin12345");

    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    // ---------------------------------------------------------------- 1. sign-in
    await consoleLogin(page, owner.email, "wrong-password");
    await waitForText(page, "Sign-in notice");
    check("wrong password shows the API error", (await text(page)).toLowerCase().includes("invalid"), (await text(page)).slice(0, 300));

    await consoleLogin(page, notOwner.email, "Admin12345");
    await waitForText(page, "don't belong to a platform owner");
    check("institution admin is refused by the console", true);

    await consoleLogin(page, owner.email, "Owner12345");
    await page.waitForFunction(() => location.pathname === "/", { timeout: 25000 });
    await waitForText(page, "E2E owner");
    check("owner signs in and the navbar shows the real name", true);
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("edupro_console_session_v2") || "{}"));
    check("session stores an API token", typeof stored.token === "string" && stored.token.split(".").length === 3);
    await waitForText(page, "MRR");
    check("overview renders KPIs from the snapshot (no endless skeleton)", true);
    await page.screenshot({ path: `${SHOTS}/console-0-overview.png` });

    // ---------------------------------------------------------------- 2. create an institution through the form
    await page.goto(`${CONSOLE}/institutions/new`, { waitUntil: "networkidle2" });
    await fill(page, "#inst-name", `E2E Academy ${tag}`);
    await fill(page, "#inst-slug", tag);
    await fill(page, "#owner-name", "E2E Principal");
    await fill(page, "#owner-email", `${tag}-principal@example.com`);
    await sleep(900); // debounced slug check
    await clickText(page, "Create institution");
    await page.waitForFunction(() => /^\/institutions\/[0-9a-f-]{36}$/.test(location.pathname), { timeout: 25000 });
    const created = await p.institution.findFirst({ where: { slug: tag } });
    ids.inst = created?.id ?? null;
    check("institution created in the database", !!created && created.ownerEmail === `${tag}-principal@example.com`, created);
    await waitForText(page, `E2E Academy ${tag}`);
    check("detail page renders the new institution from the snapshot", true);
    await page.screenshot({ path: `${SHOTS}/console-1-institution.png` });

    // duplicate slug is rejected by the live availability check
    await page.goto(`${CONSOLE}/institutions/new`, { waitUntil: "networkidle2" });
    await fill(page, "#inst-name", "Duplicate");
    await fill(page, "#inst-slug", tag);
    await waitForText(page, "already taken");
    check("slug availability comes from the API", true);

    // ---------------------------------------------------------------- 3. lists read the snapshot
    await page.goto(`${CONSOLE}/institutions`, { waitUntil: "networkidle2" });
    await waitForText(page, `E2E Academy ${tag}`);
    check("institutions list shows API data", true);
    await page.goto(`${CONSOLE}/plans`, { waitUntil: "networkidle2" });
    await waitForText(page, "Starter");
    check("plans page shows API plans", (await text(page)).includes("Pro"));

    // ---------------------------------------------------------------- 4. coupons
    const code = tag.toUpperCase().slice(0, 14);
    await page.goto(`${CONSOLE}/coupons/new`, { waitUntil: "networkidle2" });
    await fill(page, "#coupon-code", code);
    await fill(page, "#coupon-description", "E2E launch offer");
    await fill(page, "#coupon-value", "15");
    await clickText(page, "Create coupon");
    let coupon: any = null;
    for (let i = 0; i < 30 && !coupon; i++) {
      await sleep(500);
      coupon = await p.saasCoupon.findFirst({ where: { code } });
    }
    check("coupon created via the API", !!coupon && Number(coupon.value) === 15, coupon);
    await page.goto(`${CONSOLE}/coupons`, { waitUntil: "networkidle2" });
    await waitForText(page, code);
    check("coupons list shows the new coupon", true);

    // ---------------------------------------------------------------- 4b. settings image upload (validation only; no file is stored)
    const loginApi = async (email: string, password: string) =>
      ((await (await fetch(`${API}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) })).json()) as any).token as string;
    const upload = (token: string, file?: { type: string; name: string }) => {
      const form = new FormData();
      if (file) form.append("file", new Blob([Buffer.from("not really an image")], { type: file.type }), file.name);
      return fetch(`${API}/saas/owner/console-settings/upload`, { method: "POST", headers: { authorization: `Bearer ${token}` }, body: form });
    };
    const ownerToken = await loginApi(owner.email, "Owner12345");
    const adminToken = await loginApi(notOwner.email, "Admin12345");
    const noFile = await upload(ownerToken);
    const wrongType = await upload(ownerToken, { type: "application/pdf", name: "x.pdf" });
    const notOwnerUp = await upload(adminToken, { type: "image/png", name: "x.png" });
    check("settings upload is a real endpoint: no file / wrong type → 400, non-owner → 403", noFile.status === 400 && wrongType.status === 400 && notOwnerUp.status === 403, {
      noFile: noFile.status,
      wrongType: wrongType.status,
      notOwner: notOwnerUp.status,
    });

    // ---------------------------------------------------------------- 5. console settings
    await page.goto(`${CONSOLE}/settings?tab=company`, { waitUntil: "networkidle2" });
    await fill(page, "#company-legal-name", `EduPro ${tag} Ltd.`);
    await clickText(page, "Save changes");
    await waitForText(page, "Settings saved");
    const savedSettings = await p.consoleSettings.findFirst();
    check("company settings saved to the database", JSON.stringify(savedSettings).includes(`EduPro ${tag} Ltd.`));
    await page.reload({ waitUntil: "networkidle2" });
    await page.waitForSelector("#company-legal-name");
    await sleep(800);
    check("saved settings survive a reload", (await page.$eval("#company-legal-name", (e) => (e as HTMLInputElement).value)) === `EduPro ${tag} Ltd.`);

    // ---------------------------------------------------------------- 6. alerts read-state (trial ending soon)
    await p.institution.update({ where: { id: ids.inst }, data: { trialEndsAt: new Date(Date.now() + 2 * 864e5), currentPeriodEnd: new Date(Date.now() + 2 * 864e5) } });
    await page.goto(`${CONSOLE}/alerts`, { waitUntil: "networkidle2" });
    await waitForText(page, `E2E Academy ${tag}`);
    await clickText(page, "Mark all as read");
    let read: any = null;
    for (let i = 0; i < 20 && !read; i++) {
      await sleep(400);
      read = await p.consoleAlertRead.findFirst({ where: { userId: owner.id, alertId: `${ids.inst}-trial` } });
    }
    check("alert read-state saved per owner on the server", !!read);

    // ---------------------------------------------------------------- 7. "Open as owner" → admin panel
    const admin = await p.user.create({ data: { name: "E2E Principal", email: `${tag}-principal@example.com`, password: await bcrypt.hash("Principal123", 10), role: "ADMIN", status: "ACTIVE", emailVerified: true, institutionId: ids.inst } });
    ids.users.push(admin.id);
    await page.goto(`${CONSOLE}/institutions/${ids.inst}`, { waitUntil: "networkidle2" });
    await waitForText(page, `E2E Academy ${tag}`);
    await page.click('button[aria-label="More actions"]');
    await page.waitForFunction(() => [...document.querySelectorAll("[role=menuitem]")].some((e) => (e as HTMLElement).innerText.includes("Open as owner")), { timeout: 10000 });
    await page.evaluate(() => ([...document.querySelectorAll("[role=menuitem]")].find((e) => (e as HTMLElement).innerText.includes("Open as owner")) as HTMLElement).click());
    await waitForText(page, "Open as owner (impersonate)?");
    const newTarget = browser.waitForTarget((t) => t.url().startsWith(PANEL), { timeout: 25000 });
    await clickText(page, "Open panel");
    const panel = await (await newTarget).page();
    if (!panel) throw new Error("panel tab didn't open");
    await panel.setViewport({ width: 1440, height: 900 });
    await panel.waitForFunction(() => document.body.innerText.includes("Opened as owner"), { timeout: 30000 });
    check("panel opens signed in as the institution", true);
    check("impersonation token is stripped from the address bar", !panel.url().includes("impersonate="), panel.url());
    const panelToken = await panel.evaluate(() => localStorage.getItem("admin_token"));
    const claims = JSON.parse(Buffer.from((panelToken ?? "..").split(".")[1], "base64url").toString());
    check("panel token is scoped to the institution", claims.institutionId === ids.inst && claims.role === "ADMIN" && !!claims.impersonatedBy, claims);
    await panel.screenshot({ path: `${SHOTS}/console-2-impersonated-panel.png` });
    const ev = await p.saasEvent.findFirst({ where: { institutionId: ids.inst, message: { contains: "impersonation" } } });
    check("impersonation is recorded on the timeline", !!ev);
    await panel.close();

    // ---------------------------------------------------------------- 8. expired session → back to sign-in
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem("edupro_console_session_v2") || "{}");
      localStorage.setItem("edupro_console_session_v2", JSON.stringify({ ...s, token: "x.y.z" }));
    });
    await page.goto(`${CONSOLE}/institutions`, { waitUntil: "networkidle2" });
    await page.waitForFunction(() => location.pathname === "/login", { timeout: 25000 });
    check("an invalid token ends the session and returns to sign-in", true);
    await ctx.close();
  } catch (e) {
    console.log("FAIL exception", (e as Error).message);
    bad++;
    for (const [i, pg] of (await browser.pages()).entries()) {
      await pg.screenshot({ path: `${SHOTS}/console-fail-${i}.png` }).catch(() => {});
      console.log(`  page ${i}: ${pg.url()} :: ${(await text(pg).catch(() => "")).slice(0, 300).replace(/\n/g, " | ")}`);
    }
  } finally {
    await browser.close();
    if (ids.inst) {
      await p.saasCouponRedemption.deleteMany({ where: { institutionId: ids.inst } }).catch(() => {});
      for (const t of ["saasEvent", "saasInvoice", "customDomain", "teamEvent", "teamMember", "teamRole"]) await p[t]?.deleteMany({ where: { institutionId: ids.inst } }).catch(() => {});
    }
    await p.saasCoupon.deleteMany({ where: { code: { startsWith: tag.toUpperCase().slice(0, 14) } } }).catch(() => {});
    await p.consoleAlertRead.deleteMany({ where: { userId: { in: ids.users } } }).catch(() => {});
    await p.activityLog.deleteMany({ where: { userId: { in: ids.users } } }).catch(() => {});
    await p.user.deleteMany({ where: { OR: [{ id: { in: ids.users } }, { email: { startsWith: tag } }] } });
    if (ids.inst) await p.institution.deleteMany({ where: { id: ids.inst } });
    // Put the platform settings row back exactly as it was (or remove it if the test created it).
    if (settingsBefore) {
      const { id, createdAt, updatedAt, ...rest } = settingsBefore;
      await p.consoleSettings.update({ where: { id }, data: rest }).catch((err: Error) => console.log("settings restore:", err.message));
    } else await p.consoleSettings.deleteMany({}).catch(() => {});
    const left = await p.$queryRawUnsafe(`select (select count(*)::int from "User" where email like '${tag}%') users, (select count(*)::int from institutions where slug = '${tag}') insts`);
    console.log(`\n${ok} passed, ${bad} failed | leftovers ${JSON.stringify(left)}`);
    await p.$disconnect();
  }
})();
