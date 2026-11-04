/**
 * Browser E2E for the admin panel Billing & Plan + custom domain + public signup against the real API:
 * overview from /saas/me, payment method, custom domain add / remove, paying an invoice (success and a
 * declined card), downgrade, schedule cancellation + reactivate, and the public signup wizard (plans from
 * the API → PENDING admin → verify email). Panel on :3010, API on :4077. Cleanup in `finally`.
 */
import "dotenv/config";
import * as bcrypt from "bcrypt";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { PrismaService } from "../../src/prisma/prisma.service";

const PANEL = process.env.LIVE_PANEL_URL ?? "http://localhost:3010";
const SHOTS = process.env.LIVE_SHOTS_DIR ?? require("os").tmpdir();
const p: any = new PrismaService();
const tag = `e2ebil${Date.now().toString(36)}`;
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

(async () => {
  const ids = { users: [] as string[], insts: [] as string[] };
  const browser: Browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--no-first-run"] });
  try {
    const now = Date.now();
    const inst = await p.institution.create({
      data: { name: `E2E ${tag}`, slug: tag, logoInitials: "EE", type: "SCHOOL", country: "Bangladesh", ownerName: "E2E", ownerEmail: `${tag}@example.com`, planId: "pro", cycle: "MONTHLY", status: "ACTIVE", currentPeriodStart: new Date(now - 5 * 864e5), currentPeriodEnd: new Date(now + 25 * 864e5) },
    });
    ids.insts.push(inst.id);
    const admin = await p.user.create({ data: { name: "Billing Owner", email: `${tag}-owner@example.com`, password: await bcrypt.hash("Admin12345", 10), role: "ADMIN", status: "ACTIVE", emailVerified: true, institutionId: inst.id } });
    ids.users.push(admin.id);
    const mkInvoice = (n: number) =>
      p.saasInvoice.create({ data: { number: `E2E-${tag}-${n}`, institutionId: inst.id, planId: "pro", cycle: "MONTHLY", amount: 99, tax: 0, total: 99, status: "OPEN", dueAt: new Date(now + 7 * 864e5), periodStart: new Date(now), periodEnd: new Date(now + 30 * 864e5), description: `E2E invoice ${n}` } });

    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    page.on("dialog", (d) => void d.accept());
    await page.goto(`${PANEL}/login`, { waitUntil: "networkidle2" });
    await fill(page, "#email-address", admin.email);
    await fill(page, "#password-field", "Admin12345");
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => location.pathname === "/", { timeout: 25000 });

    // ---------------------------------------------------------------- 1. overview from /saas/me
    await page.goto(`${PANEL}/billing`, { waitUntil: "networkidle2" });
    await waitForText(page, "No payment method");
    check("billing overview shows this workspace's Pro plan", (await text(page)).includes("Pro"));
    await page.screenshot({ path: `${SHOTS}/billing-1-overview.png` });

    // ---------------------------------------------------------------- 2. payment method
    await realClick(page, "button", "Add method", true);
    await fill(page, "#pm-last4", "4242");
    await realClick(page, "button", "Save payment method", true);
    const withCard = await until(() => p.institution.findUnique({ where: { id: inst.id } }), (i: any) => i?.paymentLast4 === "4242");
    check("payment method saved via the API", withCard?.paymentLast4 === "4242", { brand: withCard?.paymentBrand, last4: withCard?.paymentLast4 });

    // ---------------------------------------------------------------- 3. custom domain (Pro feature)
    const domain = `${tag}.example.com`;
    await page.goto(`${PANEL}/settings?section=domain`, { waitUntil: "networkidle2" });
    await fill(page, "#custom-domain", domain);
    await realClick(page, "button", "Add domain", true);
    const cd = await until(() => p.customDomain.findFirst({ where: { institutionId: inst.id } }), (d: any) => !!d);
    check("custom domain added via the API", cd?.domain === domain && cd?.status === "PENDING_DNS", cd);
    await waitForText(page, "Waiting for DNS");
    await realClick(page, "button", "Remove", true);
    await realClick(page, "button", "Remove domain", true);
    const cdGone = await until(() => p.customDomain.findFirst({ where: { institutionId: inst.id } }), (d: any) => !d);
    check("custom domain removed", !cdGone);

    // ---------------------------------------------------------------- 4. pay invoices
    const inv1 = await mkInvoice(1);
    await page.goto(`${PANEL}/billing?tab=invoices`, { waitUntil: "networkidle2" });
    await waitForText(page, inv1.number);
    await realClick(page, "button", "Pay now", true);
    await waitForText(page, "Payment successful");
    check("paying an open invoice marks it PAID", (await p.saasInvoice.findUnique({ where: { id: inv1.id } }))?.status === "PAID");
    await p.institution.update({ where: { id: inst.id }, data: { paymentLast4: "0002" } }); // the gateway's test decline card
    const inv2 = await mkInvoice(2);
    await page.reload({ waitUntil: "networkidle2" });
    await waitForText(page, inv2.number);
    await realClick(page, "button", "Pay now", true);
    await waitForText(page, "Payment failed");
    check("a declined card shows a friendly error and leaves the invoice FAILED", (await p.saasInvoice.findUnique({ where: { id: inv2.id } }))?.status === "FAILED");
    await p.saasInvoice.update({ where: { id: inv2.id }, data: { status: "VOID" } });
    await p.institution.update({ where: { id: inst.id }, data: { paymentLast4: "4242", status: "ACTIVE" } });

    // ---------------------------------------------------------------- 5. downgrade
    await page.goto(`${PANEL}/billing?tab=plans`, { waitUntil: "networkidle2" });
    await waitForText(page, "Downgrade to Growth");
    await realClick(page, "button", "Downgrade to Growth", true);
    await realClick(page, "button", "Confirm downgrade", true);
    const down = await until(() => p.institution.findUnique({ where: { id: inst.id } }), (i: any) => i?.planId === "growth");
    check("downgrade to Growth saved", down?.planId === "growth", down?.planId);

    // ---------------------------------------------------------------- 6. schedule cancellation + reactivate
    await page.goto(`${PANEL}/billing`, { waitUntil: "networkidle2" });
    await waitForText(page, "Cancel subscription");
    await realClick(page, "button", "Cancel subscription", true);
    await realClick(page, "button", "Schedule cancellation", true);
    const cancelled = await until(() => p.institution.findUnique({ where: { id: inst.id } }), (i: any) => i?.cancelAtPeriodEnd === true);
    check("cancellation scheduled at period end", cancelled?.cancelAtPeriodEnd === true);
    await waitForText(page, "Cancellation scheduled");
    await realClick(page, "button", "Reactivate", true);
    const back = await until(() => p.institution.findUnique({ where: { id: inst.id } }), (i: any) => i?.cancelAtPeriodEnd === false);
    check("reactivate removed the scheduled cancellation", back?.cancelAtPeriodEnd === false);
    await ctx.close();

    // ---------------------------------------------------------------- 7. public signup
    const ctx2 = await browser.createBrowserContext();
    const pub = await ctx2.newPage();
    await pub.setViewport({ width: 1440, height: 900 });
    const signupSlug = `${tag}-new`;
    const signupEmail = `${tag}-signup@example.com`;
    await pub.goto(`${PANEL}/signup`, { waitUntil: "networkidle2" });
    await fill(pub, "#signup-name", "Signup Person");
    await fill(pub, "#signup-email", signupEmail);
    await fill(pub, "#signup-password", "Signup12345!");
    await realClick(pub, "button", "Continue", true);
    await fill(pub, "#signup-institution", `Signup Academy ${tag}`);
    await fill(pub, "#signup-slug", signupSlug);
    await sleep(1200); // debounced availability check
    await realClick(pub, "button", "Continue", true);
    await waitForText(pub, "Growth");
    check("signup plans come from the API", (await text(pub)).includes("Pro"));
    await pub.click('input[type="checkbox"]');
    await realClick(pub, "button", "Start free trial", true);
    await waitForText(pub, "Verify email", 30000);
    const created = await until(() => p.institution.findFirst({ where: { slug: signupSlug } }), (i: any) => !!i);
    if (created) ids.insts.push(created.id);
    const signupUser = await p.user.findFirst({ where: { email: signupEmail } });
    if (signupUser) ids.users.push(signupUser.id);
    check("signup created a TRIALING workspace", created?.status === "TRIALING", created?.status);
    check("signup created a PENDING admin (verify by email code)", signupUser?.status === "PENDING" && signupUser?.institutionId === created?.id, signupUser?.status);
    const href = await pub.evaluate(() => (document.querySelector('a[href^="/verify-email"]') as HTMLAnchorElement | null)?.getAttribute("href") ?? "");
    check("done step links to email verification", href.includes(encodeURIComponent(signupEmail)), href);
    await pub.screenshot({ path: `${SHOTS}/billing-2-signup-done.png` });
    await ctx2.close();
  } catch (e) {
    console.log("FAIL exception", (e as Error).message);
    bad++;
    for (const [i, pg] of (await browser.pages()).entries()) {
      await pg.screenshot({ path: `${SHOTS}/billing-fail-${i}.png` }).catch(() => {});
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
    const insts = { in: [...ids.insts, ...(await p.institution.findMany({ where: { slug: { startsWith: tag } }, select: { id: true } })).map((i: any) => i.id)] };
    for (const t of ["saasCouponRedemption", "saasInvoice", "saasEvent", "customDomain", "teamEvent", "teamMember", "teamRole", "workspaceSettings"]) await retry(() => p[t].deleteMany({ where: { institutionId: insts } }));
    await retry(() => p.activityLog.deleteMany({ where: { userId: { in: ids.users } } }));
    await retry(() => p.user.deleteMany({ where: { OR: [{ id: { in: ids.users } }, { email: { startsWith: tag } }] } }));
    await retry(() => p.institution.deleteMany({ where: { id: insts } }));
    const left = await p.$queryRawUnsafe(`select (select count(*)::int from "User" where email like '${tag}%') users, (select count(*)::int from institutions where slug like '${tag}%') insts`);
    console.log(`\n${ok} passed, ${bad} failed | leftovers ${JSON.stringify(left)}`);
    await p.$disconnect();
  }
})();
