/**
 * Browser E2E for the admin panel Live Classes against the real API: list from the API (no mock classes), the
 * schedule form on a real course + instructor (pickers from the API), details (course / instructor / invited
 * students), attendance override, Q&A answer, add resource, duplicate, cancel / restore, delete and workspace
 * isolation. Panel on :3021, API on :4081 by default. Cleanup in `finally`.
 */
import "dotenv/config";
import * as bcrypt from "bcrypt";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { PrismaService } from "../../src/prisma/prisma.service";

const PANEL = process.env.LIVE_PANEL_URL ?? "http://localhost:3021";
const SHOTS = process.env.LIVE_SHOTS_DIR ?? require("os").tmpdir();
const p: any = new PrismaService();
const tag = `e2elive${Date.now().toString(36)}`;
let ok = 0, bad = 0;
const check = (name: string, cond: boolean, extra?: unknown) => {
  cond ? ok++ : bad++;
  console.log(cond ? "PASS" : "FAIL", name, cond ? "" : JSON.stringify(extra)?.slice(0, 300));
};
const text = (page: Page) => page.evaluate(() => document.body.innerText);
const waitForText = (page: Page, needle: string, timeout = 30000) => page.waitForFunction((n) => document.body.innerText.includes(n), { timeout }, needle);
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
/** Native date / time inputs: set through the value setter so React sees the change. */
async function setNative(page: Page, selector: string, value: string) {
  await page.waitForSelector(selector);
  await page.$eval(
    selector,
    (el, v) => {
      const input = el as HTMLInputElement;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, v);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      input.dispatchEvent(new Event("blur", { bubbles: true }));
    },
    value,
  );
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
async function pick(page: Page, placeholder: string, option: string) {
  await realClick(page, 'button[role="combobox"]', placeholder);
  await page.waitForSelector('[role="option"]', { timeout: 10000 });
  await realClick(page, '[role="option"]', option);
  await sleep(400);
}
/** Opens the ⋯ menu whose aria-label contains `label` and clicks `item`. */
async function menu(page: Page, label: string, item: string) {
  const btn = await page.evaluateHandle((l) => {
    const visible = [...document.querySelectorAll("button[aria-label]")].filter((b) => (b as HTMLElement).offsetParent !== null);
    return visible.find((b) => b.getAttribute("aria-label") === l) ?? visible.find((b) => b.getAttribute("aria-label")!.includes(l)) ?? null;
  }, label);
  if (!btn.asElement()) throw new Error(`menu "${label}" not found`);
  await (btn.asElement() as any).click();
  await page.waitForSelector('[role="menuitem"]', { timeout: 10000 });
  await realClick(page, '[role="menuitem"]', item);
}
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

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
    const admin = await mkUser("Live Admin", "ADMIN", inst.id);
    const teacher = await mkUser("Live Teacher", "TEACHER", inst.id);
    const s1 = await mkUser("Live Student One", "STUDENT", inst.id);
    const s2 = await mkUser("Live Student Two", "STUDENT", inst.id);
    const otherAdmin = await mkUser("Other Admin", "ADMIN", other.id);
    const mkCourse = async (institutionId: string, title: string, instructorId: string) => {
      const cat = await p.category.create({ data: { name: `Cat ${title}`, slug: `cat-${title.toLowerCase().replace(/\s+/g, "-")}`, status: "ACTIVE", institutionId } });
      return p.course.create({ data: { title, slug: title.toLowerCase().replace(/\s+/g, "-"), description: "d", shortDescription: "s", categoryId: cat.id, instructorId, level: "Beginner", language: "English", price: 0, isFree: true, status: "PUBLISHED", durationMinutes: 60, institutionId } });
    };
    const course = await mkCourse(inst.id, `Live Course ${tag}`, teacher.id);
    const otherCourse = await mkCourse(other.id, `Other Course ${tag}`, otherAdmin.id);
    for (const s of [s1, s2]) await p.enrollment.create({ data: { userId: s.id, courseId: course.id, status: "ACTIVE" } });
    const settings = { allowQa: true, enableChat: true, recordClass: false, makePublic: false, sendReminder: false, autoAttendance: true };
    // A class that already happened (attendance + Q&A only make sense after the start).
    const past = await p.liveClass.create({
      data: { institutionId: inst.id, courseId: course.id, instructorId: teacher.id, title: `Past Class ${tag}`, meetingUrl: "https://meet.google.com/abc-defg-hij", startTime: new Date(Date.now() - 3 * 3600e3), endTime: new Date(Date.now() - 2 * 3600e3), status: "SCHEDULED", platform: "GOOGLE_MEET", capacity: 50, settings },
    });
    await p.liveQuestion.create({ data: { liveClassId: past.id, userId: s1.id, question: `What is a closure ${tag}?` } });
    const foreign = await p.liveClass.create({
      data: { institutionId: other.id, courseId: otherCourse.id, instructorId: otherAdmin.id, title: `Foreign Class ${tag}`, meetingUrl: "https://zoom.us/j/1", startTime: new Date(Date.now() + 5 * 864e5), endTime: new Date(Date.now() + 5 * 864e5 + 3600e3), status: "SCHEDULED", capacity: 10, settings },
    });

    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    page.on("dialog", (d) => void d.accept());
    await page.goto(`${PANEL}/login`, { waitUntil: "networkidle2" });
    await fill(page, "#email-address", admin.email);
    await fill(page, "#password-field", "Admin12345");
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => location.pathname === "/", { timeout: 25000 });

    // Every API list call the page makes (server-side paging check).
    const apiCalls: string[] = [];
    page.on("request", (r) => r.url().includes("/admin/") && apiCalls.push(r.url()));
    const pagedCall = (path: string) => apiCalls.some((u) => { const url = new URL(u); return url.pathname.endsWith(path) && url.searchParams.has("page") && Number(url.searchParams.get("limit")) <= 20; });
    // ---------------------------------------------------------------- 1. list
    await page.goto(`${PANEL}/live-classes`, { waitUntil: "networkidle2" });
    await waitForText(page, `Past Class ${tag}`);
    const t0 = await text(page);
    check("list loads from the API (seeded class, no mock classes)", !t0.includes("JavaScript Q&A Session") && !t0.includes("UI/UX Live Workshop"), t0.slice(0, 300));
    check("list shows the real course + instructor", t0.includes(`Live Course ${tag}`) && t0.includes("Live Teacher"));
    check("another workspace's class isn't listed", !t0.includes(`Foreign Class ${tag}`));
    check("live class list asks the API for one page (page + limit)", pagedCall("/admin/live-classes"), apiCalls.filter((u) => u.includes("/admin/live-classes")).slice(0, 3));
    await page.screenshot({ path: `${SHOTS}/live-1-list.png` });

    // ---------------------------------------------------------------- 2. schedule through the form
    await page.goto(`${PANEL}/live-classes/schedule`, { waitUntil: "networkidle2" });
    await page.waitForSelector("#live-title");
    await fill(page, "#live-title", `New Class ${tag}`);
    await page.waitForFunction((t) => !document.body.innerText.includes("Loading courses"), { timeout: 20000 }, "");
    await pick(page, "Select a course", `Live Course ${tag}`);
    await page.waitForFunction(() => !document.body.innerText.includes("Loading instructors"), { timeout: 20000 });
    await pick(page, "Select instructor", "Live Teacher");
    const day = new Date(Date.now() + 4 * 864e5);
    await setNative(page, "#live-date", ymd(day));
    await setNative(page, "#live-startTime", "10:00");
    await setNative(page, "#live-endTime", "11:30");
    await fill(page, "#live-link", "https://zoom.us/j/1234567890");
    await sleep(300);
    await realClick(page, "button", "Schedule Class", true);
    await page.waitForFunction(() => /^\/live-classes\/[0-9a-f-]{36}$/.test(location.pathname), { timeout: 30000 }).catch(async () => {
      const errs = await page.$$eval("p", (ps) => ps.filter((x) => x.className.includes("text-red")).map((x) => (x as HTMLElement).innerText).filter(Boolean));
      throw new Error(`schedule didn't navigate: ${errs.join(" | ")}`);
    });
    const created = await until(() => p.liveClass.findFirst({ where: { title: `New Class ${tag}` } }), (c: any) => !!c);
    check("class created in the database on the real course + instructor", created?.courseId === course.id && created?.instructorId === teacher.id && created?.institutionId === inst.id, created && { courseId: created.courseId, instructorId: created.instructorId });

    // ---------------------------------------------------------------- 3. details
    await waitForText(page, `New Class ${tag}`);
    await waitForText(page, `Live Course ${tag}`);
    const t1 = await text(page);
    check("details show the course and instructor from the API", t1.includes("Live Teacher"), t1.slice(0, 400));
    await page.goto(`${PANEL}/live-classes/${created.id}?tab=students`, { waitUntil: "networkidle2" });
    await waitForText(page, "Live Student One");
    check("students tab lists the course's enrolled students (invited)", (await text(page)).includes("Live Student Two"));
    await page.screenshot({ path: `${SHOTS}/live-2-details.png` });

    // ---------------------------------------------------------------- 4. attendance override on the past class
    await page.goto(`${PANEL}/live-classes/${past.id}?tab=students`, { waitUntil: "networkidle2" });
    await waitForText(page, "Live Student One");
    await menu(page, "Live Student One", "Mark as Attended");
    const att = await until(() => p.attendance.findFirst({ where: { liveClassId: past.id, userId: s1.id } }), (a: any) => !!a);
    check("mark as attended is saved via the API", !!att && /ATTENDED|ACTIVE|COMPLETED/.test(att.status), att);

    // ---------------------------------------------------------------- 5. Q&A answer
    const question = await p.liveQuestion.findFirst({ where: { liveClassId: past.id } });
    await page.goto(`${PANEL}/live-classes/${past.id}?tab=qa&question=${question.id}`, { waitUntil: "networkidle2" });
    await waitForText(page, `What is a closure ${tag}?`);
    await page.waitForSelector(".ProseMirror", { timeout: 20000 });
    await (await page.$(".ProseMirror"))!.click();
    await page.keyboard.type("A function bundled with its lexical scope.");
    await pick(page, "Pending", "Answered");
    await realClick(page, "button", "Update Answer");
    const q = await until(() => p.liveQuestion.findUnique({ where: { id: question.id } }), (x: any) => x?.status === "ANSWERED");
    check("answer saved via the API", q?.status === "ANSWERED" && q?.answerHtml.includes("lexical scope"), q && { status: q.status, answer: q.answerHtml });
    await page.screenshot({ path: `${SHOTS}/live-3-qa.png` });

    // ---------------------------------------------------------------- 6. add a link resource
    await page.goto(`${PANEL}/live-classes/${past.id}?tab=resources`, { waitUntil: "networkidle2" });
    await waitForText(page, "Add External Link");
    await realClick(page, "button", "Add External Link");
    await page.waitForSelector("#resource-title", { timeout: 10000 });
    await fill(page, "#resource-title", `Slides ${tag}`);
    await fill(page, "#resource-url", "https://example.com/slides");
    await realClick(page, '[role="dialog"] button', "Add Resource", true);
    const res = await until(() => p.liveResource.findFirst({ where: { liveClassId: past.id } }), (r: any) => !!r);
    check("resource added via the API", res?.title === `Slides ${tag}` && res?.url === "https://example.com/slides", res);
    await waitForText(page, `Slides ${tag}`);
    check("resource listed after the reload", true);

    // ---------------------------------------------------------------- 7. duplicate, cancel / restore, delete from the list
    await page.goto(`${PANEL}/live-classes`, { waitUntil: "networkidle2" });
    await waitForText(page, `New Class ${tag}`);
    await menu(page, `More actions for New Class ${tag}`, "Duplicate");
    const copies = await until(() => p.liveClass.count({ where: { institutionId: inst.id, title: { startsWith: `New Class ${tag}` } } }), (n: number) => n === 2);
    check("duplicate created a copy via the API", copies === 2, copies);
    await page.goto(`${PANEL}/live-classes`, { waitUntil: "networkidle2" });
    await waitForText(page, `New Class ${tag}`);
    await menu(page, `More actions for New Class ${tag}`, "Cancel Class");
    await page.waitForSelector('[role="dialog"], [role="alertdialog"]', { timeout: 10000 });
    await realClick(page, '[role="dialog"] button, [role="alertdialog"] button', "Cancel Class", true);
    const cancelled = await until(() => p.liveClass.findUnique({ where: { id: created.id } }), (c: any) => c?.status === "CANCELLED");
    check("cancel saved via the API", cancelled?.status === "CANCELLED", cancelled?.status);
    await page.goto(`${PANEL}/live-classes`, { waitUntil: "networkidle2" });
    await waitForText(page, `New Class ${tag}`);
    await menu(page, `More actions for New Class ${tag}`, "Restore Class");
    const restored = await until(() => p.liveClass.findUnique({ where: { id: created.id } }), (c: any) => c?.status !== "CANCELLED");
    check("restore saved via the API", restored && restored.status !== "CANCELLED", restored?.status);
    await page.goto(`${PANEL}/live-classes`, { waitUntil: "networkidle2" });
    await waitForText(page, `New Class ${tag}`);
    await menu(page, `More actions for New Class ${tag}`, "Delete");
    await page.waitForSelector('[role="dialog"], [role="alertdialog"]', { timeout: 10000 });
    await realClick(page, '[role="dialog"] button, [role="alertdialog"] button', "Delete Class", true);
    const gone = await until(() => p.liveClass.findUnique({ where: { id: created.id } }), (c: any) => !c);
    check("delete removed the class via the API", !gone);
    await page.screenshot({ path: `${SHOTS}/live-4-list-after.png` });

    // ---------------------------------------------------------------- 8. isolation
    await page.goto(`${PANEL}/live-classes/${foreign.id}`, { waitUntil: "networkidle2" });
    await sleep(2000);
    check("another workspace's class page isn't shown", !(await text(page)).includes(`Foreign Class ${tag}`));
    await ctx.close();
  } catch (e) {
    console.log("FAIL exception", (e as Error).message || String(e).slice(0, 400));
    bad++;
    for (const [i, pg] of (await browser.pages()).entries()) {
      await pg.screenshot({ path: `${SHOTS}/live-fail-${i}.png` }).catch(() => {});
      console.log(`  page ${i}: ${pg.url()} :: ${(await text(pg).catch(() => "")).slice(0, 500).replace(/\n/g, " | ")}`);
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
    const courses = (await p.course.findMany({ where: { institutionId: { in: ids.insts } }, select: { id: true } })).map((c: any) => c.id);
    const classes = (await p.liveClass.findMany({ where: { OR: [{ institutionId: { in: ids.insts } }, { courseId: { in: courses } }] }, select: { id: true } })).map((c: any) => c.id);
    await retry(() => p.attendance.deleteMany({ where: { OR: [{ liveClassId: { in: classes } }, { userId: { in: users } }] } }));
    await retry(() => p.liveClass.deleteMany({ where: { id: { in: classes } } }));
    await retry(() => p.notification.deleteMany({ where: { userId: { in: users } } }));
    await retry(() => p.enrollment.deleteMany({ where: { courseId: { in: courses } } }));
    await retry(() => p.course.deleteMany({ where: { id: { in: courses } } }));
    await retry(() => p.category.deleteMany({ where: { institutionId: { in: ids.insts } } }));
    for (const t of ["teamEvent", "teamMember", "teamRole", "saasEvent"]) await retry(() => p[t].deleteMany({ where: { institutionId: { in: ids.insts } } }));
    await retry(() => p.activityLog.deleteMany({ where: { userId: { in: users } } }));
    await retry(() => p.user.deleteMany({ where: { OR: [{ id: { in: users } }, { email: { startsWith: tag } }] } }));
    await retry(() => p.institution.deleteMany({ where: { id: { in: ids.insts } } }));
    const left = await p.$queryRawUnsafe(`select (select count(*)::int from "User" where email like '${tag}%') users, (select count(*)::int from institutions where slug like '${tag}%') insts, (select count(*)::int from "LiveClass" where title like '%${tag}%') classes`);
    console.log(`\n${ok} passed, ${bad} failed | leftovers ${JSON.stringify(left)}`);
    await p.$disconnect();
  }
})();
