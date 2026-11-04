/**
 * Browser E2E for the admin panel Team & Roles pages against the real API: members list (owner + "you"),
 * invite (email chips + role select), revoke invitation, change role, suspend / reactivate, create a custom
 * role, and the self-guard for a non-owner admin. Panel on :3010, API on :4077. Cleanup in `finally`.
 */
import "dotenv/config";
import * as bcrypt from "bcrypt";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { PrismaService } from "../../src/prisma/prisma.service";

const PANEL = process.env.LIVE_PANEL_URL ?? "http://localhost:3010";
const SHOTS = process.env.LIVE_SHOTS_DIR ?? require("os").tmpdir();
const p: any = new PrismaService();
const tag = `e2etm${Date.now().toString(36)}`;
let ok = 0, bad = 0;
const check = (name: string, cond: boolean, extra?: unknown) => {
  cond ? ok++ : bad++;
  console.log(cond ? "PASS" : "FAIL", name, cond ? "" : JSON.stringify(extra)?.slice(0, 300));
};
const text = (page: Page) => page.evaluate(() => document.body.innerText);
const waitForText = (page: Page, needle: string, timeout = 25000) => page.waitForFunction((n) => document.body.innerText.includes(n), { timeout }, needle);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until<T>(fn: () => Promise<T>, okFn: (v: T) => boolean, tries = 30) {
  let v = await fn();
  for (let i = 0; i < tries && !okFn(v); i++) {
    await sleep(400);
    v = await fn();
  }
  return v;
}
async function fill(page: Page, selector: string, value: string) {
  await page.waitForSelector(selector);
  await page.click(selector, { clickCount: 3 });
  await page.keyboard.press("Backspace");
  if (value) await page.type(selector, value);
}
/** Real pointer click on the last visible element in `selector` whose text includes `label` (Radix needs it). */
async function realClick(page: Page, selector: string, label: string, exact = false) {
  const handle = await page.evaluateHandle(
    (sel, l, ex) =>
      [...document.querySelectorAll<HTMLElement>(sel)].reverse().find((e) => (ex ? e.innerText.trim() === l : e.innerText.trim().includes(l)) && e.offsetParent !== null && !(e as HTMLButtonElement).disabled) ?? null,
    selector,
    label,
    exact,
  );
  const el = handle.asElement();
  if (!el) throw new Error(`No "${label}" in ${selector}`);
  await (el as any).click();
}
/** Opens a row's ⋮ menu (waits for any closing dialog, retries once if the menu didn't appear). */
async function openRowMenu(page: Page, who: string) {
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'), { timeout: 10000 }).catch(() => undefined);
  for (let i = 0; i < 3; i++) {
    await page.click(`button[aria-label="More actions for ${who}"]`);
    const opened = await page.waitForSelector('[role="menuitem"]', { timeout: 3000 }).then(() => true).catch(() => false);
    if (opened) return;
    await page.keyboard.press("Escape");
    await sleep(400);
  }
  throw new Error(`Row menu for ${who} didn't open`);
}

async function login(page: Page, email: string) {
  await page.goto(`${PANEL}/login`, { waitUntil: "networkidle2" });
  await fill(page, "#email-address", email);
  await fill(page, "#password-field", "Admin12345");
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => location.pathname === "/", { timeout: 25000 });
}

(async () => {
  const ids = { users: [] as string[], inst: null as string | null };
  const browser: Browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--no-first-run"] });
  try {
    const inst = await p.institution.create({ data: { name: `E2E ${tag}`, slug: tag, logoInitials: "EE", type: "SCHOOL", country: "Bangladesh", ownerName: "E2E", ownerEmail: `${tag}@example.com`, planId: "pro", status: "ACTIVE", currentPeriodStart: new Date(), currentPeriodEnd: new Date(Date.now() + 30 * 864e5) } });
    ids.inst = inst.id;
    const mk = async (n: string, ageDays: number) => {
      const u = await p.user.create({ data: { name: n, email: `${tag}-${n.toLowerCase().replace(/\s+/g, "-")}@example.com`, password: await bcrypt.hash("Admin12345", 10), role: "ADMIN", status: "ACTIVE", emailVerified: true, institutionId: inst.id, createdAt: new Date(Date.now() - ageDays * 864e5) } });
      ids.users.push(u.id);
      return u;
    };
    const owner = await mk("E2E Owner", 10);
    const second = await mk("Second Admin", 5);

    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    page.on("dialog", (d) => void d.accept()); // "leave with unsaved changes?" prompts
    if (process.env.LIVE_DEBUG) page.on("response", async (r) => r.url().includes("/team") && console.log("  [net]", r.status(), r.url(), (await r.text().catch(() => "")).slice(0, 160)));
    await login(page, owner.email);

    // ---------------------------------------------------------------- 1. members list from the API
    await page.goto(`${PANEL}/users`, { waitUntil: "networkidle2" });
    await waitForText(page, "Second Admin");
    const t = await text(page);
    check("members list comes from the API (owner + second admin)", t.includes("E2E Owner") && t.includes("Second Admin"));
    check("no mock members", !t.includes("Imam Hossain") && !t.includes("Nusrat"));
    await page.screenshot({ path: `${SHOTS}/team-1-members.png` });

    // ---------------------------------------------------------------- 2. invite
    const inviteEmail = `${tag}-invitee@example.com`;
    await realClick(page, "button", "Invite member", true);
    await page.waitForSelector("#invite-emails");
    await page.type("#invite-emails", inviteEmail);
    await page.keyboard.press("Enter");
    await page.click('[role="dialog"] button[role="combobox"]');
    await realClick(page, '[role="option"]', "Support");
    await realClick(page, "button", "Send invitation");
    const invited = await until(() => p.teamMember.findFirst({ where: { institutionId: inst.id, email: inviteEmail } }), (m: any) => !!m);
    check("invitation saved via the API", invited?.status === "INVITED", invited);

    // ---------------------------------------------------------------- 3. revoke
    await page.goto(`${PANEL}/users?tab=invitations`, { waitUntil: "networkidle2" });
    await waitForText(page, inviteEmail);
    await page.click(`button[aria-label="Revoke invitation for ${inviteEmail}"]`);
    await realClick(page, "button", "Revoke invite", true);
    const gone = await until(() => p.teamMember.findFirst({ where: { id: invited.id } }), (m: any) => !m);
    check("revoke deleted the invitation", !gone);

    // ---------------------------------------------------------------- 4. change role
    await page.goto(`${PANEL}/users`, { waitUntil: "networkidle2" });
    await waitForText(page, "Second Admin");
    await openRowMenu(page, "Second Admin");
    await realClick(page, '[role="menuitem"]', "Change role");
    await waitForText(page, "Change role");
    await realClick(page, '[role="radio"]', "Support");
    await realClick(page, "button", "Change role", true);
    const support = await p.teamRole.findFirst({ where: { institutionId: inst.id, name: "Support" } });
    const moved = await until(() => p.teamMember.findFirst({ where: { userId: second.id } }), (m: any) => m?.roleId === support.id);
    check("change role saved (Second Admin → Support)", moved?.roleId === support.id, moved);

    // ---------------------------------------------------------------- 5. suspend + reactivate
    await openRowMenu(page, "Second Admin");
    await realClick(page, '[role="menuitem"]', "Suspend");
    await realClick(page, "button", "Suspend", true);
    const suspended = await until(() => p.teamMember.findFirst({ where: { userId: second.id } }), (m: any) => m?.status === "SUSPENDED");
    check("suspend saved", suspended?.status === "SUSPENDED", suspended?.status);
    await sleep(500);
    await openRowMenu(page, "Second Admin");
    await realClick(page, '[role="menuitem"]', "Reactivate");
    const reactivated = await until(() => p.teamMember.findFirst({ where: { userId: second.id } }), (m: any) => m?.status === "ACTIVE");
    check("reactivate saved", reactivated?.status === "ACTIVE", reactivated?.status);

    // ---------------------------------------------------------------- 6. create a custom role
    await page.goto(`${PANEL}/users/roles/new`, { waitUntil: "networkidle2" });
    await fill(page, "#role-name", "Grader");
    await realClick(page, "button", "View only", true);
    await realClick(page, "button", "Create role", true);
    const grader = await until(() => p.teamRole.findFirst({ where: { institutionId: inst.id, name: "Grader" } }), (r: any) => !!r);
    check("custom role created via the API", !!grader && !grader.isSystem, grader);
    await page.waitForFunction(() => location.pathname === "/users", { timeout: 25000 }); // the editor returns to the list itself
    await waitForText(page, "Grader");
    check("roles tab shows the new role", true);
    await ctx.close();

    // ---------------------------------------------------------------- 7. self-guard for a non-owner admin
    const ctx2 = await browser.createBrowserContext();
    const page2 = await ctx2.newPage();
    await page2.setViewport({ width: 1440, height: 900 });
    // Give Second Admin team management, then sign in as them.
    const adminRole = await p.teamRole.findFirst({ where: { institutionId: inst.id, name: "Admin" } });
    await p.teamMember.update({ where: { id: moved.id }, data: { roleId: adminRole.id } });
    await login(page2, second.email);
    await page2.goto(`${PANEL}/users`, { waitUntil: "networkidle2" });
    await waitForText(page2, "Second Admin");
    check("own row is marked (you)", (await text(page2)).includes("(you)"));
    await openRowMenu(page2, "Second Admin");
    await page2.waitForFunction(() => [...document.querySelectorAll("[role=menuitem]")].some((e) => (e as HTMLElement).innerText.includes("Ask another admin")), { timeout: 10000 });
    const items = await page2.evaluate(() => [...document.querySelectorAll("[role=menuitem]")].map((e) => (e as HTMLElement).innerText.trim()));
    check("no self-edit actions for your own row", !items.some((i) => /Suspend|Remove from team|Change role/.test(i)), items);
    await ctx2.close();
  } catch (e) {
    console.log("FAIL exception", (e as Error).message);
    bad++;
    for (const [i, pg] of (await browser.pages()).entries()) {
      await pg.screenshot({ path: `${SHOTS}/team-fail-${i}.png` }).catch(() => {});
      console.log(`  page ${i}: ${pg.url()} :: ${(await text(pg).catch(() => "")).slice(0, 400).replace(/\n/g, " | ")}`);
    }
  } finally {
    await browser.close();
    const retry = async (step: () => Promise<unknown>) => {
      for (let i = 0; i < 4; i++) {
        try {
          return await step();
        } catch (err) {
          if (i === 3) console.log("cleanup failed:", (err as Error).message.slice(0, 120));
          await sleep(1500);
        }
      }
    };
    if (ids.inst) {
      for (const t of ["teamEvent", "teamMember", "teamRole"]) await retry(() => p[t].deleteMany({ where: { institutionId: ids.inst } }));
      await retry(() => p.workspaceSettings.deleteMany({ where: { institutionId: ids.inst } }));
    }
    await retry(() => p.activityLog.deleteMany({ where: { userId: { in: ids.users } } }));
    await retry(() => p.user.deleteMany({ where: { OR: [{ id: { in: ids.users } }, { email: { startsWith: tag } }] } }));
    if (ids.inst) await retry(() => p.institution.deleteMany({ where: { id: ids.inst } }));
    const left = await p.$queryRawUnsafe(`select (select count(*)::int from "User" where email like '${tag}%') users, (select count(*)::int from institutions where slug = '${tag}') insts`);
    console.log(`\n${ok} passed, ${bad} failed | leftovers ${JSON.stringify(left)}`);
    await p.$disconnect();
  }
})();
