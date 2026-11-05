/**
 * Shared helpers for the panel browser suites (panel-notifications / -settings / -categories / -lesson-editor):
 * check counter, waits, form filling, Radix-safe clicks, a tagged test workspace with an admin, and cleanup.
 */
import "dotenv/config";
import * as bcrypt from "bcrypt";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { PrismaService } from "../../src/prisma/prisma.service";

export const PANEL = process.env.LIVE_PANEL_URL ?? "http://localhost:3010";
export const SHOTS = process.env.LIVE_SHOTS_DIR ?? require("os").tmpdir();
export const prisma: any = new PrismaService();
export const newTag = () => `e2elive${Date.now().toString(36)}`;

export const result = { ok: 0, bad: 0 };
export const check = (name: string, cond: boolean, extra?: unknown) => {
  cond ? result.ok++ : result.bad++;
  console.log(cond ? "PASS" : "FAIL", name, cond ? "" : JSON.stringify(extra)?.slice(0, 300));
};
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const text = (page: Page) => page.evaluate(() => document.body.innerText);
export const waitForText = (page: Page, needle: string, timeout = 30000) =>
  page.waitForFunction((n) => document.body.innerText.includes(n), { timeout }, needle);
export const waitForNoText = (page: Page, needle: string, timeout = 15000) =>
  page.waitForFunction((n) => !document.body.innerText.includes(n), { timeout }, needle);

/** Polls `fn` until `okFn` holds (or the tries run out) and returns the last value. */
export async function until<T>(fn: () => Promise<T>, okFn: (v: T) => boolean, tries = 30) {
  let v = await fn();
  for (let i = 0; i < tries && !okFn(v); i++) {
    await sleep(400);
    v = await fn();
  }
  return v;
}

export async function fill(page: Page, selector: string, value: string) {
  await page.waitForSelector(selector);
  await page.click(selector);
  await page.$eval(selector, (e) => (e as HTMLInputElement).select());
  await page.keyboard.press("Backspace");
  if (value) await page.type(selector, value);
}

/** Real click on the last visible, enabled element matching `selector` whose text contains (or equals) `label`. */
export async function realClick(page: Page, selector: string, label: string, exact = false) {
  const handle = await page.evaluateHandle(
    (sel, l, ex) =>
      [...document.querySelectorAll<HTMLElement>(sel)]
        .reverse()
        .find((e) => (ex ? e.innerText.trim() === l : e.innerText.trim().includes(l)) && e.offsetParent !== null && !(e as HTMLButtonElement).disabled) ?? null,
    selector,
    label,
    exact,
  );
  const el = handle.asElement();
  if (!el) throw new Error(`No "${label}" in ${selector}`);
  await (el as any).click();
}

/** Real click on the visible element whose attribute `attr` equals (or contains) `value`. */
export async function clickAttr(page: Page, attr: string, value: string) {
  const handle = await page.evaluateHandle(
    (a, v) => {
      const visible = [...document.querySelectorAll<HTMLElement>(`[${a}]`)].filter((e) => e.offsetParent !== null);
      return visible.find((e) => e.getAttribute(a) === v) ?? visible.find((e) => e.getAttribute(a)!.includes(v)) ?? null;
    },
    attr,
    value,
  );
  const el = handle.asElement();
  if (!el) throw new Error(`No [${attr}*="${value}"]`);
  await (el as any).click();
}

export async function pick(page: Page, placeholder: string, option: string) {
  await realClick(page, 'button[role="combobox"]', placeholder);
  await page.waitForSelector('[role="option"]', { timeout: 10000 });
  await realClick(page, '[role="option"]', option);
  await sleep(400);
}

export async function launch(): Promise<Browser> {
  return puppeteer.launch({
    executablePath: process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
    args: ["--no-first-run"],
  });
}

/** A tagged Pro workspace; ids land in `ids.insts`. */
export async function mkInstitution(ids: Ids, slug: string) {
  const i = await prisma.institution.create({
    data: { name: `E2E ${slug}`, slug, logoInitials: "EE", type: "SCHOOL", country: "Bangladesh", ownerName: "E2E", ownerEmail: `${slug}@example.com`, planId: "pro", status: "ACTIVE", currentPeriodStart: new Date(), currentPeriodEnd: new Date(Date.now() + 30 * 864e5) },
  });
  ids.insts.push(i.id);
  return i;
}

export async function mkUser(ids: Ids, tag: string, name: string, role: string, institutionId: string) {
  const u = await prisma.user.create({
    data: { name, email: `${tag}-${name.toLowerCase().replace(/\s+/g, "-")}@example.com`, password: await bcrypt.hash("Admin12345", 10), role, status: "ACTIVE", emailVerified: true, institutionId },
  });
  ids.users.push(u.id);
  return u;
}

export async function mkCourse(institutionId: string, title: string, instructorId: string, categoryId?: string) {
  const catId =
    categoryId ??
    (await prisma.category.create({ data: { name: `Cat ${title}`, slug: `cat-${title.toLowerCase().replace(/\s+/g, "-")}`, status: "ACTIVE", institutionId } })).id;
  return prisma.course.create({
    data: { title, slug: title.toLowerCase().replace(/\s+/g, "-"), description: "d", shortDescription: "s", categoryId: catId, instructorId, level: "Beginner", language: "English", price: 0, isFree: true, status: "PUBLISHED", durationMinutes: 60, institutionId },
  });
}

export async function login(browser: Browser, email: string) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  page.on("dialog", (d) => void d.accept());
  await page.goto(`${PANEL}/login`, { waitUntil: "networkidle2" });
  await fill(page, "#email-address", email);
  await fill(page, "#password-field", "Admin12345");
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => location.pathname === "/", { timeout: 25000 });
  return { ctx, page };
}

export async function dumpPages(browser: Browser, prefix: string) {
  for (const [i, pg] of (await browser.pages()).entries()) {
    await pg.screenshot({ path: `${SHOTS}/${prefix}-fail-${i}.png` }).catch(() => {});
    console.log(`  page ${i}: ${pg.url()} :: ${(await text(pg).catch(() => "")).slice(0, 500).replace(/\n/g, " | ")}`);
  }
}

export interface Ids {
  users: string[];
  insts: string[];
}

export async function retry(step: () => Promise<unknown>) {
  for (let i = 0; i < 4; i++) {
    try {
      return await step();
    } catch (err) {
      if (i === 3) console.log("cleanup failed:", (err as Error).message.slice(0, 160));
      await sleep(1500);
    }
  }
}

/**
 * Removes everything of the test workspaces: `extra` runs first (feature rows), then courses (with modules,
 * lessons, resources, enrollments), categories, team / saas rows, notifications, logs, users and the workspaces.
 */
export async function cleanup(ids: Ids, tag: string, extra: (courses: string[]) => Promise<void> = async () => {}) {
  const p = prisma;
  const users = ids.users;
  const courses = (await p.course.findMany({ where: { institutionId: { in: ids.insts } }, select: { id: true } })).map((c: any) => c.id);
  await extra(courses);
  // Modules, lessons and lesson resources cascade with the course.
  await retry(() => p.lessonProgress.deleteMany({ where: { courseId: { in: courses } } }));
  await retry(() => p.enrollment.deleteMany({ where: { courseId: { in: courses } } }));
  await retry(() => p.course.deleteMany({ where: { id: { in: courses } } }));
  await retry(() => p.category.deleteMany({ where: { institutionId: { in: ids.insts } } }));
  for (const t of ["teamEvent", "teamMember", "teamRole", "saasEvent"]) await retry(() => p[t].deleteMany({ where: { institutionId: { in: ids.insts } } }));
  await retry(() => p.notification.deleteMany({ where: { userId: { in: users } } }));
  await retry(() => p.activityLog.deleteMany({ where: { userId: { in: users } } }));
  await retry(() => p.user.deleteMany({ where: { OR: [{ id: { in: users } }, { email: { startsWith: tag } }] } }));
  await retry(() => p.institution.deleteMany({ where: { id: { in: ids.insts } } }));
}

export async function report(tag: string, extraSql = "") {
  const left = await prisma.$queryRawUnsafe(
    `select (select count(*)::int from "User" where email like '${tag}%') users, (select count(*)::int from institutions where slug like '${tag}%') insts${extraSql}`,
  );
  console.log(`\n${result.ok} passed, ${result.bad} failed | leftovers ${JSON.stringify(left)}`);
  await prisma.$disconnect();
}
