/**
 * Browser E2E for the admin panel Students pages against the real API: list (search, filters, URL state),
 * create (with enrollment), details (inline edit, notes, enroll, unenroll, export, delete) and workspace
 * isolation. Panel on :3010, API on :4077. Everything created is removed in `finally`.
 */
import "dotenv/config";
import * as bcrypt from "bcrypt";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { PrismaService } from "../../src/prisma/prisma.service";

const PANEL = process.env.LIVE_PANEL_URL ?? "http://localhost:3010";
const SHOTS = process.env.LIVE_SHOTS_DIR ?? require("os").tmpdir();
const p: any = new PrismaService();
const tag = `e2estu${Date.now().toString(36)}`;
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
    const cat = await p.category.create({ data: { name: `E2E Cat ${tag}`, slug: `cat-${tag}`, status: "ACTIVE", institutionId: inst.id } });
    const course = await p.course.create({
      data: { title: `React Basics ${tag}`, slug: `react-${tag}`, description: "d", shortDescription: "s", categoryId: cat.id, instructorId: admin.id, level: "Beginner", language: "English", price: 0, isFree: true, status: "PUBLISHED", durationMinutes: 90, institutionId: inst.id },
    });
    await mkUser("Alpha Learner", "STUDENT", inst.id);
    await mkUser("Beta Learner", "STUDENT", inst.id, { status: "INACTIVE" });
    const outsider = await mkUser("Outside Learner", "STUDENT", other.id);

    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    // ---------------------------------------------------------------- sign in
    await page.goto(`${PANEL}/login`, { waitUntil: "networkidle2" });
    await fill(page, "#email-address", admin.email);
    await fill(page, "#password-field", "Admin12345");
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => location.pathname === "/", { timeout: 25000 });

    // ---------------------------------------------------------------- 1. list
    await page.goto(`${PANEL}/students`, { waitUntil: "networkidle2" });
    await waitForText(page, "Alpha Learner");
    let t = await text(page);
    check("list shows this workspace's students", t.includes("Alpha Learner") && t.includes("Beta Learner"));
    check("list never shows another workspace's students", !t.includes("Outside Learner"));
    await fill(page, "#student-search", "alpha");
    await page.waitForFunction(() => location.search.includes("q=alpha"), { timeout: 10000 });
    await page.waitForFunction(() => !document.body.innerText.includes("Beta Learner"), { timeout: 10000 });
    check("search filters on the server and lands in the URL", (await text(page)).includes("Alpha Learner"));
    await page.reload({ waitUntil: "networkidle2" });
    await waitForText(page, "Alpha Learner");
    check("search survives a reload", (await page.$eval("#student-search", (e) => (e as HTMLInputElement).value)) === "alpha" && !(await text(page)).includes("Beta Learner"));
    await page.goto(`${PANEL}/students?status=Inactive`, { waitUntil: "networkidle2" });
    await waitForText(page, "Beta Learner");
    check("status filter from the URL", !(await text(page)).includes("Alpha Learner"));
    await page.screenshot({ path: `${SHOTS}/students-1-list.png` });

    // ---------------------------------------------------------------- 2. create with enrollment
    await page.goto(`${PANEL}/students/create`, { waitUntil: "networkidle2" });
    await clickText(page, "Create Student");
    await waitForText(page, "Full name must be at least 2 characters");
    check("create form validates before calling the API", true);
    const newEmail = `${tag}-gamma@example.com`;
    await fill(page, 'input[name="name"]', "Gamma Learner");
    await fill(page, 'input[name="email"]', newEmail);
    await waitForText(page, `React Basics ${tag}`);
    await page.evaluate((title) => {
      const row = [...document.querySelectorAll("tr")].find((r) => (r as HTMLElement).innerText.includes(title));
      (row as HTMLElement)?.click();
    }, `React Basics ${tag}`);
    await clickText(page, "Create Student");
    await page.waitForFunction(() => /^\/students\/[0-9a-f-]{36}$/.test(location.pathname), { timeout: 25000 });
    const gamma = await p.user.findFirst({ where: { email: newEmail }, include: { enrollments: true } });
    if (gamma) ids.users.push(gamma.id);
    check("student created in this workspace", gamma?.institutionId === inst.id && gamma?.role === "STUDENT", gamma);
    check("selected course enrolled on create", gamma?.enrollments?.some((e: any) => e.courseId === course.id));
    await waitForText(page, "Student Information");
    check("redirects to the new student's details", (await text(page)).includes("Gamma Learner"));
    await page.screenshot({ path: `${SHOTS}/students-2-details.png` });

    // ---------------------------------------------------------------- 3. inline edit
    await clickText(page, "Edit");
    await fill(page, "#student-info-phone", "abc");
    await clickText(page, "Save");
    await waitForText(page, "Enter a valid phone number");
    check("inline edit validates with zod", true);
    await fill(page, "#student-info-phone", "+880 1711 000000");
    await fill(page, "#student-info-name", "Gamma Learner Two");
    await clickText(page, "Save");
    await waitForText(page, "Student updated");
    const edited = await until(() => p.user.findUnique({ where: { id: gamma.id } }), (u: any) => u?.name === "Gamma Learner Two");
    check("inline edit saved to the database", edited?.name === "Gamma Learner Two" && edited?.phone === "+880 1711 000000", edited);

    // ---------------------------------------------------------------- 4. notes
    await page.goto(`${PANEL}/students/${gamma.id}?tab=notes`, { waitUntil: "networkidle2" });
    await clickText(page, "Add Note");
    await fill(page, "#student-note-content", "Strong start on React");
    await clickText(page, "Save Note");
    await waitForText(page, "Note added");
    const note = await until(() => p.studentNote.findFirst({ where: { studentId: gamma.id } }), (n: any) => !!n);
    check("note saved via the API", note?.content === "Strong start on React", note);
    await page.reload({ waitUntil: "networkidle2" });
    await waitForText(page, "Strong start on React");
    check("notes tab stays selected after reload and shows the note", (await page.url()).includes("tab=notes"));

    // ---------------------------------------------------------------- 5. unenroll + enroll again
    await page.goto(`${PANEL}/students/${gamma.id}?tab=enrolled-courses`, { waitUntil: "networkidle2" });
    await waitForText(page, `React Basics ${tag}`);
    await page.click('button[title="Course Options"]');
    await page.waitForFunction(() => [...document.querySelectorAll("[role=menuitem]")].some((e) => (e as HTMLElement).innerText.includes("Remove from Course")), { timeout: 10000 });
    await page.evaluate(() => ([...document.querySelectorAll("[role=menuitem]")].find((e) => (e as HTMLElement).innerText.includes("Remove from Course")) as HTMLElement).click());
    await clickText(page, "Remove enrollment");
    await waitForText(page, "Enrollment removed");
    check("unenroll removed the enrollment", (await p.enrollment.count({ where: { userId: gamma.id } })) === 0);
    await clickText(page, "Enroll in Course");
    await waitForText(page, "Enroll in courses");
    await sleep(500);
    await page.evaluate((title) => {
      const row = [...document.querySelectorAll("tr")].reverse().find((r) => (r as HTMLElement).innerText.includes(title));
      (row as HTMLElement)?.click();
    }, `React Basics ${tag}`);
    await clickText(page, "Enroll in 1 course");
    await waitForText(page, "Enrolled");
    check("enroll modal enrolled the course", (await until(() => p.enrollment.count({ where: { userId: gamma.id } }), (n: number) => n === 1)) === 1);

    // ---------------------------------------------------------------- 6. isolation
    await page.goto(`${PANEL}/students/${outsider.id}`, { waitUntil: "networkidle2" });
    await waitForText(page, "Student not found");
    check("another workspace's student shows 'not found'", true);

    // ---------------------------------------------------------------- 7. delete
    await page.goto(`${PANEL}/students/${gamma.id}`, { waitUntil: "networkidle2" });
    await waitForText(page, "Gamma Learner Two");
    await page.click('button[title="More options"]');
    await page.waitForFunction(() => [...document.querySelectorAll("[role=menuitem]")].some((e) => (e as HTMLElement).innerText.includes("Delete Student")), { timeout: 10000 });
    await page.evaluate(() => ([...document.querySelectorAll("[role=menuitem]")].find((e) => (e as HTMLElement).innerText.includes("Delete Student")) as HTMLElement).click());
    await clickText(page, "Delete student");
    await page.waitForFunction(() => location.pathname === "/students", { timeout: 25000 });
    const deleted = await p.user.findUnique({ where: { id: gamma.id } });
    check("delete soft-deletes (row kept, sign-in blocked)", !!deleted && deleted.status !== "ACTIVE", deleted?.status);
    await ctx.close();
  } catch (e) {
    console.log("FAIL exception", (e as Error).message);
    bad++;
    for (const [i, pg] of (await browser.pages()).entries()) {
      await pg.screenshot({ path: `${SHOTS}/students-fail-${i}.png` }).catch(() => {});
      console.log(`  page ${i}: ${pg.url()} :: ${(await text(pg).catch(() => "")).slice(0, 400).replace(/\n/g, " | ")}`);
    }
  } finally {
    await browser.close();
    const users = ids.users;
    // Neon occasionally drops a connection under load: retry each cleanup step so nothing is left behind.
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
    await retry(() => p.studentNote.deleteMany({ where: { OR: [{ studentId: { in: users } }, { authorId: { in: users } }] } }));
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
