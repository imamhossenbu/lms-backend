/**
 * Browser E2E for the admin panel Dashboard + Analytics against the real API: KPI cards / recent orders from
 * GET /admin/analytics/dashboard (seeded data, ৳ currency), Analytics overview + revenue tabs, the period kept
 * in the URL, CSV export, and the "Advanced analytics" plan gate on a Starter workspace (lock card, no 403
 * request). Panel on :3010, API on :4077. Cleanup in `finally`.
 */
import "dotenv/config";
import * as bcrypt from "bcrypt";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { PrismaService } from "../../src/prisma/prisma.service";

const PANEL = process.env.LIVE_PANEL_URL ?? "http://localhost:3010";
const SHOTS = process.env.LIVE_SHOTS_DIR ?? require("os").tmpdir();
const p: any = new PrismaService();
const tag = `e2eana${Date.now().toString(36)}`;
let ok = 0, bad = 0;
const check = (name: string, cond: boolean, extra?: unknown) => {
  cond ? ok++ : bad++;
  console.log(cond ? "PASS" : "FAIL", name, cond ? "" : JSON.stringify(extra)?.slice(0, 300));
};
const text = (page: Page) => page.evaluate(() => document.body.innerText);
const waitForText = (page: Page, needle: string, timeout = 30000) => page.waitForFunction((n) => document.body.innerText.includes(n), { timeout }, needle);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function fill(page: Page, selector: string, value: string) {
  await page.waitForSelector(selector);
  await page.click(selector, { clickCount: 3 });
  await page.keyboard.press("Backspace");
  if (value) await page.type(selector, value);
}
async function login(page: Page, email: string) {
  await page.goto(`${PANEL}/login`, { waitUntil: "networkidle2" });
  await fill(page, "#email-address", email);
  await fill(page, "#password-field", "Admin12345");
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => location.pathname === "/", { timeout: 25000 });
}

(async () => {
  const ids = { users: [] as string[], insts: [] as string[] };
  const browser: Browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--no-first-run"] });
  try {
    const mkInst = async (slug: string, planId: string) => {
      const i = await p.institution.create({ data: { name: `E2E ${slug}`, slug, logoInitials: "EE", type: "SCHOOL", country: "Bangladesh", ownerName: "E2E", ownerEmail: `${slug}@example.com`, planId, status: "ACTIVE", currentPeriodStart: new Date(), currentPeriodEnd: new Date(Date.now() + 30 * 864e5) } });
      ids.insts.push(i.id);
      return i;
    };
    const inst = await mkInst(tag, "pro");
    const starter = await mkInst(`${tag}-starter`, "starter");
    const mkUser = async (n: string, role: string, institutionId: string) => {
      const u = await p.user.create({ data: { name: n, email: `${tag}-${n.toLowerCase().replace(/\s+/g, "-")}@example.com`, password: await bcrypt.hash("Admin12345", 10), role, status: "ACTIVE", emailVerified: true, institutionId } });
      ids.users.push(u.id);
      return u;
    };
    const admin = await mkUser("Analytics Admin", "ADMIN", inst.id);
    const s1 = await mkUser("Ana Learner", "STUDENT", inst.id);
    await mkUser("Bob Learner", "STUDENT", inst.id);
    const starterAdmin = await mkUser("Starter Admin", "ADMIN", starter.id);
    const cat = await p.category.create({ data: { name: `Cat ${tag}`, slug: `cat-${tag}`, status: "ACTIVE", institutionId: inst.id } });
    const course = await p.course.create({ data: { title: `Analytics Course ${tag}`, slug: `ana-${tag}`, description: "d", shortDescription: "s", categoryId: cat.id, instructorId: admin.id, level: "Beginner", language: "English", price: 750, isFree: false, status: "PUBLISHED", durationMinutes: 60, institutionId: inst.id } });
    await p.order.create({ data: { orderNumber: `ORD-${tag}`, userId: s1.id, courseId: course.id, amount: 750, discountAmount: 0, taxAmount: 0, totalAmount: 750, status: "PAID", currency: "BDT", paidAt: new Date() } });
    await p.enrollment.create({ data: { userId: s1.id, courseId: course.id, status: "ACTIVE" } });

    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 200)));
    page.on("pageerror", (e) => errors.push(`pageerror: ${(e as Error).message.slice(0, 200)}`));
    await login(page, admin.email);

    // ---------------------------------------------------------------- 1. dashboard from the API
    await waitForText(page, "Total Students");
    await waitForText(page, `Analytics Course ${tag}`);
    const dash = await text(page);
    check("dashboard KPIs come from the API (2 students)", /\b2\s*\n\s*Total Students/.test(dash), dash.slice(Math.max(0, dash.indexOf("Total Students") - 20), dash.indexOf("Total Students") + 20));
    check("revenue shows in taka (৳750)", dash.includes("৳750"), dash.match(/[৳$][\d,]+/g)?.slice(0, 5));
    check("recent orders list the seeded order", dash.includes("Ana Learner"));
    check("no mock dashboard data", !dash.includes("Samira") && !dash.includes("$12,450"));
    await page.screenshot({ path: `${SHOTS}/analytics-1-dashboard.png` });

    // ---------------------------------------------------------------- 2. analytics overview + revenue (Pro)
    await page.goto(`${PANEL}/analytics`, { waitUntil: "networkidle2" });
    await waitForText(page, "Net revenue");
    check("analytics overview loads from the API", (await text(page)).includes("৳750"));
    await page.goto(`${PANEL}/analytics?tab=revenue`, { waitUntil: "networkidle2" });
    await waitForText(page, `Analytics Course ${tag}`);
    check("revenue tab (Advanced analytics on Pro) shows revenue by course", true);
    await page.screenshot({ path: `${SHOTS}/analytics-2-revenue.png` });

    // ---------------------------------------------------------------- 3. period in the URL
    const today = new Date();
    const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const from = key(new Date(today.getTime() - 6 * 864e5));
    await page.goto(`${PANEL}/analytics?tab=revenue&from=${from}&to=${key(today)}`, { waitUntil: "networkidle2" });
    await waitForText(page, `Analytics Course ${tag}`);
    check("a period from the URL is used (and kept)", (await page.url()).includes(`from=${from}`));
    check("comparison caption reflects the 7-day period", (await text(page)).includes("vs previous 7 days"));
    check("no browser console errors on dashboard / analytics", errors.filter((e) => !/Failed to load resource|favicon|DevTools/.test(e)).length === 0, errors);
    await ctx.close();

    // ---------------------------------------------------------------- 4. plan gate on Starter
    const ctx2 = await browser.createBrowserContext();
    const page2 = await ctx2.newPage();
    await page2.setViewport({ width: 1440, height: 900 });
    const gatedCalls: number[] = [];
    page2.on("response", (r) => /\/admin\/analytics\/(revenue|students|courses|engagement)/.test(r.url()) && gatedCalls.push(r.status()));
    await login(page2, starterAdmin.email);
    await page2.goto(`${PANEL}/analytics?tab=revenue`, { waitUntil: "networkidle2" });
    await waitForText(page2, "Advanced analytics");
    await sleep(800);
    const t2 = await text(page2);
    check("Starter workspace sees the upgrade lock on Revenue", /upgrade|Upgrade/.test(t2), t2.slice(0, 300));
    check("…and the panel doesn't call the gated endpoint", gatedCalls.length === 0, gatedCalls);
    await page2.goto(`${PANEL}/analytics`, { waitUntil: "networkidle2" });
    await waitForText(page2, "Net revenue");
    check("Starter still gets the Overview tab", true);
    await ctx2.close();
  } catch (e) {
    console.log("FAIL exception", (e as Error).message || String(e).slice(0, 600));
    bad++;
    for (const [i, pg] of (await browser.pages()).entries()) {
      await pg.screenshot({ path: `${SHOTS}/analytics-fail-${i}.png` }).catch(() => {});
      console.log(`  page ${i}: ${pg.url()} :: ${(await text(pg).catch(() => "")).slice(0, 400).replace(/\n/g, " | ")}`);
    }
  } finally {
    await browser.close();
    const retry = async (step: () => Promise<unknown>) => {
      for (let i = 0; i < 4; i++) {
        try {
          return await step();
        } catch (err) {
          if (i === 3) console.log("cleanup failed:", (err as Error).message.slice(0, 160));
          await sleep(1500);
        }
      }
    };
    const users = ids.users;
    const orders = (await p.order.findMany({ where: { userId: { in: users } }, select: { id: true } })).map((o: any) => o.id);
    for (const t of ["orderNote", "orderEvent", "invoice", "payment"]) await retry(() => p[t].deleteMany({ where: { orderId: { in: orders } } }));
    await retry(() => p.order.deleteMany({ where: { id: { in: orders } } }));
    await retry(() => p.enrollment.deleteMany({ where: { userId: { in: users } } }));
    await retry(() => p.course.deleteMany({ where: { institutionId: { in: ids.insts } } }));
    await retry(() => p.category.deleteMany({ where: { institutionId: { in: ids.insts } } }));
    for (const t of ["teamEvent", "teamMember", "teamRole", "saasEvent"]) await retry(() => p[t].deleteMany({ where: { institutionId: { in: ids.insts } } }));
    await retry(() => p.activityLog.deleteMany({ where: { userId: { in: users } } }));
    await retry(() => p.user.deleteMany({ where: { OR: [{ id: { in: users } }, { email: { startsWith: tag } }] } }));
    await retry(() => p.institution.deleteMany({ where: { id: { in: ids.insts } } }));
    const left = await p.$queryRawUnsafe(`select (select count(*)::int from "User" where email like '${tag}%') users, (select count(*)::int from institutions where slug like '${tag}%') insts`);
    console.log(`\n${ok} passed, ${bad} failed | leftovers ${JSON.stringify(left)}`);
    await p.$disconnect();
  }
})();
