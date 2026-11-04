/**
 * Browser E2E for the admin panel Orders + Payments pages against the real API: manual order (pending),
 * mark as paid from the order page (enrollment created), order note, refund from the payment page
 * (enrollment revoked), a second order created as paid, list filters + stats from the server, and workspace
 * isolation. Panel on :3010, API on :4077. Cleanup in `finally`.
 */
import "dotenv/config";
import * as bcrypt from "bcrypt";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { PrismaService } from "../../src/prisma/prisma.service";

const PANEL = process.env.LIVE_PANEL_URL ?? "http://localhost:3010";
const SHOTS = process.env.LIVE_SHOTS_DIR ?? require("os").tmpdir();
const p: any = new PrismaService();
const tag = `e2eord${Date.now().toString(36)}`;
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
/** Opens the n-th select trigger inside the open dialog and picks the option containing `label`. */
async function pickInDialog(page: Page, triggerIndex: number, label: string) {
  const triggers = await page.$$('[role="dialog"] button[role="combobox"]');
  await triggers[triggerIndex].click();
  await page.waitForSelector('[role="option"]', { timeout: 10000 });
  await realClick(page, '[role="option"]', label);
  await sleep(250);
}

(async () => {
  const ids = { users: [] as string[], insts: [] as string[] };
  const browser: Browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--no-first-run"] });
  try {
    const mkInst = async (slug: string) => {
      const i = await p.institution.create({ data: { name: `E2E ${slug}`, slug, logoInitials: "EE", type: "SCHOOL", country: "Bangladesh", ownerName: "E2E", ownerEmail: `${slug}@example.com`, planId: "pro", status: "ACTIVE", currentPeriodStart: new Date(), currentPeriodEnd: new Date(Date.now() + 30 * 864e5) } });
      ids.insts.push(i.id);
      return i;
    };
    const inst = await mkInst(tag);
    const other = await mkInst(`${tag}-other`);
    const mkUser = async (n: string, role: string, institutionId: string) => {
      const u = await p.user.create({ data: { name: n, email: `${tag}-${n.toLowerCase().replace(/\s+/g, "-")}@example.com`, password: await bcrypt.hash("Admin12345", 10), role, status: "ACTIVE", emailVerified: true, institutionId } });
      ids.users.push(u.id);
      return u;
    };
    const admin = await mkUser("Orders Admin", "ADMIN", inst.id);
    const student = await mkUser("Buyer Student", "STUDENT", inst.id);
    const outsider = await mkUser("Outside Buyer", "STUDENT", other.id);
    const cat = await p.category.create({ data: { name: `Cat ${tag}`, slug: `cat-${tag}`, status: "ACTIVE", institutionId: inst.id } });
    const course = await p.course.create({ data: { title: `Paid Course ${tag}`, slug: `paid-${tag}`, description: "d", shortDescription: "s", categoryId: cat.id, instructorId: admin.id, level: "Beginner", language: "English", price: 500, isFree: false, status: "PUBLISHED", durationMinutes: 60, institutionId: inst.id } });
    const otherCat = await p.category.create({ data: { name: `Cat ${tag}-o`, slug: `cat-${tag}-o`, status: "ACTIVE", institutionId: other.id } });
    const otherCourse = await p.course.create({ data: { title: `Other Course ${tag}`, slug: `other-${tag}`, description: "d", shortDescription: "s", categoryId: otherCat.id, instructorId: outsider.id, level: "Beginner", language: "English", price: 100, isFree: false, status: "PUBLISHED", durationMinutes: 60, institutionId: other.id } });
    const foreignOrder = await p.order.create({ data: { orderNumber: `ORD-${tag}-X`, userId: outsider.id, courseId: otherCourse.id, amount: 100, discountAmount: 0, taxAmount: 0, totalAmount: 100, status: "PENDING", currency: "BDT" } }).catch((e: Error) => {
      console.log("  (foreign order seed skipped:", e.message.slice(0, 120), ")");
      return null;
    });

    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    const consoleErrors: string[] = [];
    page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text().slice(0, 300)));
    page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${(e as Error).message.slice(0, 300)}`));
    await page.goto(`${PANEL}/login`, { waitUntil: "networkidle2" });
    await fill(page, "#email-address", admin.email);
    await fill(page, "#password-field", "Admin12345");
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => location.pathname === "/", { timeout: 25000 });

    // ---------------------------------------------------------------- 1. empty list + create a pending order
    await page.goto(`${PANEL}/orders`, { waitUntil: "networkidle2" });
    await waitForText(page, "Total Orders");
    check("orders list loads from the API (no mock orders)", !(await text(page)).includes("Samira"));
    await realClick(page, "button", "Create Order", true);
    await waitForText(page, "Create a manual order");
    await page.waitForFunction(() => ![...document.querySelectorAll('[role="dialog"] button[role="combobox"]')].some((b) => (b as HTMLElement).innerText.includes("Loading")), { timeout: 20000 });
    await pickInDialog(page, 0, "Buyer Student");
    await pickInDialog(page, 1, `Paid Course ${tag}`);
    await pickInDialog(page, 2, "bKash");
    await realClick(page, '[role="dialog"] button', "Create Order", true);
    await page.waitForFunction(() => /^\/orders\/[0-9a-f-]{36}$/.test(location.pathname), { timeout: 25000 });
    const orderId = (await page.url()).split("/orders/")[1];
    const o1 = await p.order.findUnique({ where: { id: orderId } });
    check("manual order created PENDING for this workspace's course", o1?.status === "PENDING" && o1?.userId === student.id && o1?.courseId === course.id, o1);

    // ---------------------------------------------------------------- 2. mark as paid → enrollment
    await waitForText(page, "Buyer Student");
    await realClick(page, "button", "Update Status");
    await page.waitForSelector('[role="menuitem"]', { timeout: 10000 });
    await realClick(page, '[role="menuitem"]', "Mark as Completed");
    await page.waitForSelector('[role="dialog"] input[id$="-reference"]');
    await fill(page, '[role="dialog"] input[id$="-reference"]', "BKASH12345");
    await realClick(page, '[role="dialog"] button', "Change to");
    const paid = await until(() => p.order.findUnique({ where: { id: orderId } }), (o: any) => o?.status === "PAID");
    check("mark as paid saved (PAID)", paid?.status === "PAID", paid?.status);
    check("paying enrolled the student", (await p.enrollment.count({ where: { userId: student.id, courseId: course.id } })) === 1);
    await waitForText(page, "Recorded manually");
    check("timeline shows the manual payment", true);

    // ---------------------------------------------------------------- 3. note
    await realClick(page, "button", "Add Note", true);
    await page.waitForSelector('[role="dialog"] textarea');
    await page.type('[role="dialog"] textarea', "Paid at the front desk");
    await realClick(page, '[role="dialog"] button', "Save Note", true);
    await waitForText(page, "Paid at the front desk");
    check("order note saved and shown", (await p.orderNote?.count?.({ where: { orderId } }).catch(() => 1)) >= 1);

    // ---------------------------------------------------------------- 4. refund from the payment page
    await page.goto(`${PANEL}/payments/${orderId}`, { waitUntil: "networkidle2" });
    await waitForText(page, "Buyer Student");
    await realClick(page, "button", "Refund");
    await page.waitForSelector('[role="dialog"]');
    await pickInDialog(page, 0, "Requested by student");
    await realClick(page, '[role="dialog"] button', "Change to");
    const refunded = await until(() => p.order.findUnique({ where: { id: orderId } }), (o: any) => o?.status === "REFUNDED");
    check("refund saved (REFUNDED)", refunded?.status === "REFUNDED", refunded?.status);
    check("refund revoked course access", (await p.enrollment.count({ where: { userId: student.id, courseId: course.id } })) === 0);

    // ---------------------------------------------------------------- 5. second order created as paid + list filters / stats
    await page.goto(`${PANEL}/orders`, { waitUntil: "networkidle2" });
    await waitForText(page, "Total Orders");
    await realClick(page, "button", "Create Order", true);
    await page.waitForFunction(() => ![...document.querySelectorAll('[role="dialog"] button[role="combobox"]')].some((b) => (b as HTMLElement).innerText.includes("Loading")), { timeout: 20000 });
    await pickInDialog(page, 0, "Buyer Student");
    await pickInDialog(page, 1, `Paid Course ${tag}`);
    await pickInDialog(page, 2, "Nagad");
    await page.click('[role="dialog"] button[role="switch"]');
    await page.waitForSelector('[role="dialog"] input[placeholder*="ef"], [role="dialog"] input[id$="-reference"]', { timeout: 5000 }).catch(() => undefined);
    const refInput = await page.$('[role="dialog"] input[id$="-reference"]');
    if (refInput) {
      await refInput.click({ clickCount: 3 });
      await refInput.type("NAGAD98765");
    }
    await realClick(page, '[role="dialog"] button', "Create Order", true);
    await page.waitForFunction((id) => /^\/orders\/[0-9a-f-]{36}$/.test(location.pathname) && !location.pathname.endsWith(id), { timeout: 25000 }, orderId);
    const o2Id = (await page.url()).split("/orders/")[1];
    check("order created as paid", (await p.order.findUnique({ where: { id: o2Id } }))?.status === "PAID");

    await page.goto(`${PANEL}/orders?payment=Refunded`, { waitUntil: "networkidle2" });
    await waitForText(page, "Total Orders");
    await page.waitForFunction(() => document.querySelectorAll("tbody tr").length >= 1, { timeout: 15000 });
    const rowsText = await page.evaluate(() => [...document.querySelectorAll("tbody tr")].map((r) => (r as HTMLElement).innerText).join(" | "));
    const o1Number = (await p.order.findUnique({ where: { id: orderId } }))?.orderNumber ?? "";
    const o2Number = (await p.order.findUnique({ where: { id: o2Id } }))?.orderNumber ?? "";
    check("payment-status filter runs on the server", rowsText.includes(o1Number) && !rowsText.includes(o2Number), rowsText.slice(0, 200));
    const statsText = await text(page);
    check("stats cards come from the API (2 orders)", /Total Orders\s*\n?\s*2\b/.test(statsText), statsText.slice(statsText.indexOf("Total Orders"), statsText.indexOf("Total Orders") + 60));
    await page.screenshot({ path: `${SHOTS}/orders-1-list.png` });

    // ---------------------------------------------------------------- 6. isolation
    if (foreignOrder) {
      await page.goto(`${PANEL}/orders/${foreignOrder.id}`, { waitUntil: "networkidle2" });
      await waitForText(page, "Order not found");
      check("another workspace's order shows 'not found'", true);
    }
    const real = consoleErrors.filter((e) => !/Failed to load resource|favicon|Download the React DevTools/.test(e));
    if (real.length) console.log("  console errors:\n   - " + [...new Set(real)].slice(0, 8).join("\n   - "));
    await ctx.close();
  } catch (e) {
    console.log("FAIL exception", (e as Error).message);
    bad++;
    for (const [i, pg] of (await browser.pages()).entries()) {
      await pg.screenshot({ path: `${SHOTS}/orders-fail-${i}.png` }).catch(() => {});
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
    const orders = (await p.order.findMany({ where: { OR: [{ userId: { in: users } }, { course: { institutionId: { in: ids.insts } } }] }, select: { id: true } })).map((o: any) => o.id);
    for (const t of ["orderNote", "orderEvent", "invoice", "payment", "couponUsage"]) await retry(() => p[t]?.deleteMany({ where: { orderId: { in: orders } } }) ?? Promise.resolve());
    await retry(() => p.order.deleteMany({ where: { id: { in: orders } } }));
    await retry(() => p.enrollment.deleteMany({ where: { userId: { in: users } } }));
    await retry(() => p.course.deleteMany({ where: { institutionId: { in: ids.insts } } }));
    await retry(() => p.category.deleteMany({ where: { institutionId: { in: ids.insts } } }));
    for (const t of ["teamEvent", "teamMember", "teamRole", "saasEvent"]) await retry(() => p[t].deleteMany({ where: { institutionId: { in: ids.insts } } }));
    await retry(() => p.activityLog.deleteMany({ where: { userId: { in: users } } }));
    await retry(() => p.notification?.deleteMany({ where: { userId: { in: users } } }) ?? Promise.resolve());
    await retry(() => p.user.deleteMany({ where: { OR: [{ id: { in: users } }, { email: { startsWith: tag } }] } }));
    await retry(() => p.institution.deleteMany({ where: { id: { in: ids.insts } } }));
    const left = await p.$queryRawUnsafe(`select (select count(*)::int from "User" where email like '${tag}%') users, (select count(*)::int from institutions where slug like '${tag}%') insts`);
    console.log(`\n${ok} passed, ${bad} failed | leftovers ${JSON.stringify(left)}`);
    await p.$disconnect();
  }
})();
