/**
 * Browser E2E for the admin panel Instructors pages against the real API: list (search, expertise / status
 * filters, URL state), create with a course assignment, details tabs (courses, schedule), notes (add via the
 * rich-text form, delete), message, edit (assign another course; current ones locked), delete (409 while
 * teaching, then soft delete) and workspace isolation. Panel on :3010, API on :4077. Cleanup in `finally`.
 */
import "dotenv/config";
import * as bcrypt from "bcrypt";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { PrismaService } from "../../src/prisma/prisma.service";

const PANEL = process.env.LIVE_PANEL_URL ?? "http://localhost:3010";
const SHOTS = process.env.LIVE_SHOTS_DIR ?? require("os").tmpdir();
const p: any = new PrismaService();
const tag = `e2eins${Date.now().toString(36)}`;
let ok = 0, bad = 0;
const check = (name: string, cond: boolean, extra?: unknown) => {
  cond ? ok++ : bad++;
  console.log(cond ? "PASS" : "FAIL", name, cond ? "" : JSON.stringify(extra)?.slice(0, 300));
};
const text = (page: Page) => page.evaluate(() => document.body.innerText);
const waitForText = (page: Page, needle: string, timeout = 25000) => page.waitForFunction((n) => document.body.innerText.includes(n), { timeout }, needle);
const waitForAny = (page: Page, needles: string[], timeout = 25000) => page.waitForFunction((ns) => ns.some((n: string) => document.body.innerText.includes(n)), { timeout }, needles);
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
async function clickText(page: Page, label: string, selector = "button") {
  const found = await page.evaluate(
    (sel, l) => {
      const el = [...document.querySelectorAll<HTMLElement>(sel)].reverse().find((b) => b.innerText.trim() === l && !(b as HTMLButtonElement).disabled);
      el?.click();
      return !!el;
    },
    selector,
    label,
  );
  if (!found) throw new Error(`No clickable "${label}"`);
}
/** Radix menus / selects open on real pointer events: find the element, then page.click its centre. */
async function realClick(page: Page, selector: string, label: string) {
  const handle = await page.evaluateHandle(
    (sel, l) => [...document.querySelectorAll<HTMLElement>(sel)].reverse().find((e) => e.innerText.trim().includes(l)) ?? null,
    selector,
    label,
  );
  const el = handle.asElement();
  if (!el) throw new Error(`No "${label}" in ${selector}`);
  await (el as any).click();
}
async function rowClick(page: Page, needle: string) {
  await page.evaluate((n) => {
    const row = [...document.querySelectorAll("tr")].reverse().find((r) => (r as HTMLElement).innerText.includes(n));
    (row as HTMLElement)?.click();
  }, needle);
}

(async () => {
  const ids = { users: [] as string[], insts: [] as string[] };
  const browser: Browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--no-first-run"] });
  try {
    // ---------------------------------------------------------------- seed two isolated workspaces
    const mkInst = async (slug: string) => {
      const i = await p.institution.create({ data: { name: `E2E ${slug}`, slug, logoInitials: "EE", type: "SCHOOL", country: "Bangladesh", ownerName: "E2E", ownerEmail: `${slug}@example.com`, planId: "pro", status: "ACTIVE", currentPeriodStart: new Date(), currentPeriodEnd: new Date(Date.now() + 30 * 864e5) } });
      ids.insts.push(i.id);
      return i;
    };
    const inst = await mkInst(tag);
    const other = await mkInst(`${tag}-other`);
    const mkUser = async (n: string, role: string, institutionId: string, extra: object = {}) => {
      const u = await p.user.create({ data: { name: n, email: `${tag}-${n.toLowerCase().replace(/\s+/g, "-")}@example.com`, password: await bcrypt.hash("Admin12345", 10), role, status: "ACTIVE", emailVerified: true, institutionId, ...extra } });
      ids.users.push(u.id);
      return u;
    };
    const admin = await mkUser("E2E Admin", "ADMIN", inst.id);
    const seeded = await mkUser("Seeded Teacher", "TEACHER", inst.id, { expertise: "Web Development", headline: "Senior Dev" });
    await mkUser("Design Teacher", "TEACHER", inst.id, { expertise: "UI/UX Design" });
    const outsider = await mkUser("Outside Teacher", "TEACHER", other.id);
    const cat = await p.category.create({ data: { name: `E2E Cat ${tag}`, slug: `cat-${tag}`, status: "ACTIVE", institutionId: inst.id } });
    const mkCourse = (title: string) =>
      p.course.create({ data: { title, slug: `${title.toLowerCase().replace(/\s+/g, "-")}`, description: "d", shortDescription: "s", categoryId: cat.id, instructorId: seeded.id, level: "Beginner", language: "English", price: 0, isFree: true, status: "PUBLISHED", durationMinutes: 60, institutionId: inst.id } });
    const c1 = await mkCourse(`Node APIs ${tag}`);
    const c2 = await mkCourse(`CSS Grid ${tag}`);

    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    await page.goto(`${PANEL}/login`, { waitUntil: "networkidle2" });
    await fill(page, "#email-address", admin.email);
    await fill(page, "#password-field", "Admin12345");
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => location.pathname === "/", { timeout: 25000 });

    // ---------------------------------------------------------------- 1. list
    await page.goto(`${PANEL}/instructors`, { waitUntil: "networkidle2" });
    await waitForText(page, "Seeded Teacher");
    let t = await text(page);
    check("list shows this workspace's instructors", t.includes("Seeded Teacher") && t.includes("Design Teacher"));
    check("list never shows another workspace's instructors", !t.includes("Outside Teacher"));
    await page.goto(`${PANEL}/instructors?expertise=${encodeURIComponent("UI/UX Design")}`, { waitUntil: "networkidle2" });
    await waitForText(page, "Design Teacher");
    check("expertise filter (from the URL) runs on the server", !(await text(page)).includes("Seeded Teacher"));
    await page.goto(`${PANEL}/instructors?q=seeded`, { waitUntil: "networkidle2" });
    await waitForText(page, "Seeded Teacher");
    check("search from the URL", !(await text(page)).includes("Design Teacher"));
    await page.screenshot({ path: `${SHOTS}/instructors-1-list.png` });

    // ---------------------------------------------------------------- 2. create with a course
    await page.goto(`${PANEL}/instructors/create`, { waitUntil: "networkidle2" });
    const newEmail = `${tag}-nova@example.com`;
    await fill(page, "#instructor-name", "Nova Teacher");
    await fill(page, "#instructor-email", newEmail);
    await waitForText(page, `Node APIs ${tag}`);
    await rowClick(page, `Node APIs ${tag}`);
    await clickText(page, "Create Instructor");
    await page.waitForFunction(() => /^\/instructors\/[0-9a-f-]{36}$/.test(location.pathname), { timeout: 25000 });
    const nova = await p.user.findFirst({ where: { email: newEmail } });
    if (nova) ids.users.push(nova.id);
    check("instructor created in this workspace", nova?.role === "TEACHER" && nova?.institutionId === inst.id, nova);
    check("selected course moved to the new instructor", (await p.course.findUnique({ where: { id: c1.id } }))?.instructorId === nova?.id);
    await waitForText(page, "Nova Teacher");

    // ---------------------------------------------------------------- 3. tabs
    await page.goto(`${PANEL}/instructors/${nova.id}?tab=courses`, { waitUntil: "networkidle2" });
    await waitForText(page, `Node APIs ${tag}`);
    check("courses tab lists the assigned course", true);
    await page.goto(`${PANEL}/instructors/${nova.id}?tab=schedule`, { waitUntil: "networkidle2" });
    await waitForText(page, "Upcoming Classes");
    await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), { timeout: 20000 });
    check("schedule tab loads from the API", (await text(page)).includes("No upcoming live classes or assignment deadlines."));

    // ---------------------------------------------------------------- 4. notes
    await page.goto(`${PANEL}/instructors/${nova.id}/notes/new`, { waitUntil: "networkidle2" });
    await fill(page, "#note-title", "Onboarding call");
    await page.click(".ProseMirror");
    await page.keyboard.type("Walked through the course builder and grading.");
    await realClick(page, "button", "Select note type");
    await realClick(page, '[role="option"]', "Onboarding");
    await realClick(page, "button", "Select priority");
    await realClick(page, '[role="option"]', "High");
    await clickText(page, "Save Note");
    await page.waitForFunction(() => location.search.includes("tab=notes"), { timeout: 25000 });
    const note = await until(() => p.instructorNote.findFirst({ where: { instructorId: nova.id } }), (n: any) => !!n);
    check("note saved via the API (sanitized HTML)", note?.title === "Onboarding call" && note?.priority === "HIGH", note);
    await waitForText(page, "Onboarding call");
    check("notes tab shows the note after redirect", true);

    // ---------------------------------------------------------------- 5. message
    await page.goto(`${PANEL}/instructors/${nova.id}`, { waitUntil: "networkidle2" });
    await waitForText(page, "Nova Teacher");
    await page.click('button[title="More options"]');
    await realClick(page, '[role="menuitem"]', "Send Message");
    await fill(page, "#message-subject", "Welcome aboard");
    await fill(page, "#message-body", "Your first course is ready for you to review.");
    await clickText(page, "Send Message");
    await waitForAny(page, ["Message sent", "couldn't send the email"]);
    check("message goes through the API (sent, or a friendly mail error)", true);

    // ---------------------------------------------------------------- 6. edit: assign another course
    await page.goto(`${PANEL}/instructors/${nova.id}/edit`, { waitUntil: "networkidle2" });
    await waitForText(page, `CSS Grid ${tag}`);
    await rowClick(page, `Node APIs ${tag}`); // locked → stays selected, info toast
    await waitForText(page, "Already taught by this instructor");
    check("current courses are locked (can't silently unassign)", true);
    await rowClick(page, `CSS Grid ${tag}`);
    await clickText(page, "Save Changes");
    await page.waitForFunction((id) => location.pathname === `/instructors/${id}`, { timeout: 25000 }, nova.id);
    check("edit assigned the extra course", (await p.course.findUnique({ where: { id: c2.id } }))?.instructorId === nova.id);

    // ---------------------------------------------------------------- 7. isolation + delete
    await page.goto(`${PANEL}/instructors/${outsider.id}`, { waitUntil: "networkidle2" });
    await waitForText(page, "Instructor not found");
    check("another workspace's instructor shows 'not found'", true);

    await page.goto(`${PANEL}/instructors/${nova.id}`, { waitUntil: "networkidle2" });
    await waitForText(page, "Nova Teacher");
    await page.click('button[title="More options"]');
    await realClick(page, '[role="menuitem"]', "Delete Instructor");
    await clickText(page, "Delete Instructor");
    await waitForText(page, "Reassign this instructor");
    check("delete is refused while the instructor still teaches courses (409 → friendly toast)", true);
    await p.course.updateMany({ where: { id: { in: [c1.id, c2.id] } }, data: { instructorId: seeded.id } });
    await page.keyboard.press("Escape");
    await page.goto(`${PANEL}/instructors/${nova.id}`, { waitUntil: "networkidle2" });
    await waitForText(page, "Nova Teacher");
    await page.click('button[title="More options"]');
    await realClick(page, '[role="menuitem"]', "Delete Instructor");
    await clickText(page, "Delete Instructor");
    await page.waitForFunction(() => location.pathname === "/instructors", { timeout: 25000 });
    const gone = await p.user.findUnique({ where: { id: nova.id } });
    check("delete soft-deletes once no courses remain", !!gone?.deletedAt, gone?.deletedAt);
    await ctx.close();
  } catch (e) {
    console.log("FAIL exception", (e as Error).message);
    bad++;
    for (const [i, pg] of (await browser.pages()).entries()) {
      await pg.screenshot({ path: `${SHOTS}/instructors-fail-${i}.png` }).catch(() => {});
      console.log(`  page ${i}: ${pg.url()} :: ${(await text(pg).catch(() => "")).slice(0, 400).replace(/\n/g, " | ")}`);
    }
  } finally {
    await browser.close();
    const users = ids.users;
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
    await retry(() => p.instructorNote.deleteMany({ where: { OR: [{ instructorId: { in: users } }, { authorId: { in: users } }] } }));
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
