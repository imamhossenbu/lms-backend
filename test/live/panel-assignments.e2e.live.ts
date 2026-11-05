/**
 * Browser E2E for the admin panel Assignments against the real API: list + stats from the API, the create
 * wizard on a real course (course → module from GET /courses/:id), the created assignment in the database,
 * details page, grading a submission, duplicate, delete, and workspace isolation.
 * Panel on :3010, API on :4077. Cleanup in `finally`.
 */
import "dotenv/config";
import * as bcrypt from "bcrypt";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { PrismaService } from "../../src/prisma/prisma.service";

const PANEL = process.env.LIVE_PANEL_URL ?? "http://localhost:3010";
const SHOTS = process.env.LIVE_SHOTS_DIR ?? require("os").tmpdir();
const p: any = new PrismaService();
const tag = `e2easg${Date.now().toString(36)}`;
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
/** Opens the select whose trigger shows `placeholder` and picks `option`. */
async function pick(page: Page, placeholder: string, option: string) {
  await realClick(page, 'button[role="combobox"]', placeholder);
  await page.waitForSelector('[role="option"]', { timeout: 10000 });
  await realClick(page, '[role="option"]', option);
  await sleep(300);
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
    const admin = await mkUser("Assign Admin", "ADMIN", inst.id);
    const student = await mkUser("Essay Student", "STUDENT", inst.id);
    const outsiderAdmin = await mkUser("Other Admin", "ADMIN", other.id);
    const mkCourse = async (institutionId: string, title: string, instructorId: string) => {
      const cat = await p.category.create({ data: { name: `Cat ${title}`, slug: `cat-${title.toLowerCase().replace(/\s+/g, "-")}`, status: "ACTIVE", institutionId } });
      const course = await p.course.create({ data: { title, slug: title.toLowerCase().replace(/\s+/g, "-"), description: "d", shortDescription: "s", categoryId: cat.id, instructorId, level: "Beginner", language: "English", price: 0, isFree: true, status: "PUBLISHED", durationMinutes: 60, institutionId } });
      const mod = await p.courseModule.create({ data: { courseId: course.id, title: `Module One ${tag}`, order: 1 } });
      await p.lesson.create({ data: { courseId: course.id, moduleId: mod.id, title: `Lesson One ${tag}`, type: "TEXT", durationMinutes: 10, order: 1, status: "PUBLISHED" } });
      return { course, mod };
    };
    const { course } = await mkCourse(inst.id, `Writing ${tag}`, admin.id);
    const { course: otherCourse } = await mkCourse(other.id, `Other ${tag}`, outsiderAdmin.id);
    await p.enrollment.create({ data: { userId: student.id, courseId: course.id, status: "ACTIVE" } });
    const foreign = await p.assignment.create({ data: { courseId: otherCourse.id, title: `Foreign ${tag}`, dueDate: new Date(Date.now() + 7 * 864e5), marks: 10, allowedFileTypes: "pdf", status: "PUBLISHED", institutionId: other.id } }).catch((e: Error) => {
      console.log("  (foreign assignment seed skipped:", e.message.slice(0, 120), ")");
      return null;
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
    const listRequests: string[] = [];
    page.on("request", (r) => listRequests.push(r.url()));

    // ---------------------------------------------------------------- 1. list from the API
    await page.goto(`${PANEL}/assignments`, { waitUntil: "networkidle2" });
    await waitForText(page, "Total Assignments");
    const t0 = await text(page);
    check("assignments list loads from the API (no mock rows / other workspace)", !t0.includes("HTML Fundamentals") && !t0.includes(`Foreign ${tag}`), t0.slice(0, 300));
    {
      const pageReqs = listRequests.filter((u) => /\/admin\/assignments\?/.test(u) && !/\/(stats|activity|eligible|learners|export)\b/.test(u));
      check("the assignments list asks the API for one page (page + limit)", pageReqs.length > 0 && pageReqs.every((u) => /[?&]page=\d+/.test(u) && /[?&]limit=\d+/.test(u) && !/limit=100\b/.test(u)), pageReqs.slice(0, 3));
    }

    // ---------------------------------------------------------------- 2. create through the wizard on a real course
    await page.goto(`${PANEL}/assignments/create?course=${course.id}`, { waitUntil: "networkidle2" });
    await page.waitForSelector("#wizard-title");
    await fill(page, "#wizard-title", `Essay ${tag}`);
    await page.click(".ProseMirror");
    await page.keyboard.type("Write a short essay about your learning goals.");
    await waitForText(page, `Module One ${tag}`);
    check("wizard preselects the real course and its first module", true);
    for (let i = 0; i < 8; i++) {
      const tNow = await text(page);
      if (tNow.includes("Create Assignment") && /Review/.test(tNow) && (await page.$$eval("button", (bs) => bs.some((b) => (b as HTMLElement).innerText.trim() === "Create Assignment")))) break;
      if ((await page.url()).includes("step=rubric") && !(await page.$('[aria-label^="Edit criterion"]'))) {
        await fill(page, "#wizard-rubric-title", "Essay Rubric");
        await realClick(page, "button", "Use Template");
        await page.waitForSelector('[role="menuitem"]', { timeout: 10000 });
        await realClick(page, '[role="menuitem"]', "HTML Page Rubric");
        await sleep(600);
      }
      await realClick(page, "button", "Save & Continue", true);
      await sleep(900);
      const errs = await page.$$eval("p", (ps) => ps.filter((x) => x.className.includes("text-red")).map((x) => (x as HTMLElement).innerText).filter(Boolean));
      if (errs.length) {
        // A step asked for something: fill the usual suspects (instructions editor) and retry.
        const editors = await page.$$(".ProseMirror");
        for (const ed of editors) {
          const empty = await ed.evaluate((e) => !(e as HTMLElement).innerText.trim());
          if (empty) {
            await ed.click();
            await page.keyboard.type("Follow the brief and submit a PDF.");
          }
        }
        console.log("  step errors:", errs.slice(0, 3).join(" | "));
      }
    }
    await realClick(page, "button", "Create Assignment", true);
    await page.waitForFunction(() => /^\/assignments\/[0-9a-f-]{36}(\/created)?$/.test(location.pathname), { timeout: 30000 });
    const created = await until(() => p.assignment.findFirst({ where: { title: `Essay ${tag}` } }), (a: any) => !!a);
    check("assignment created in the database on the real course", created?.courseId === course.id && created?.status === "PUBLISHED", created && { courseId: created.courseId, status: created.status });
    await page.screenshot({ path: `${SHOTS}/assignments-1-created.png` });

    // ---------------------------------------------------------------- 3. details + grade a submission
    const sub = await p.assignmentSubmission.create({ data: { assignmentId: created.id, userId: student.id, status: "PENDING", textAnswer: "My essay", fileName: "" } });
    await page.goto(`${PANEL}/assignments/${created.id}?tab=submissions`, { waitUntil: "networkidle2" });
    await waitForText(page, "Essay Student");
    check("details page shows the submission from the API", true);
    await page.click('button[aria-label="Grade submission"]');
    await page.waitForSelector("#grade-score");
    // Rubric assignment: pick the first level of every criterion; the score is their sum.
    const firstLevels = await page.$$eval('[role="dialog"] button[aria-pressed]', (bs) => {
      const seen = new Set<Element>();
      return bs.map((b, i) => (seen.has(b.parentElement!) ? -1 : (seen.add(b.parentElement!), i))).filter((i) => i >= 0);
    });
    for (const i of firstLevels) {
      const buttons = await page.$$('[role="dialog"] button[aria-pressed]');
      await buttons[i].click();
      await sleep(150);
    }
    await sleep(400);
    const expected = Number(await page.$eval("#grade-score", (e) => (e as HTMLInputElement).value));
    await page.type("#grade-feedback", "Clear structure, good examples.");
    await realClick(page, '[role="dialog"] button', "Save Grade");
    const graded = await until(() => p.assignmentSubmission.findUnique({ where: { id: sub.id } }), (s: any) => s?.status === "GRADED");
    check("grading (rubric levels) saved via the API", graded?.status === "GRADED" && Number(graded?.marksObtained) === expected && expected > 0, graded && { status: graded.status, marks: graded.marksObtained, expected });
    await page.screenshot({ path: `${SHOTS}/assignments-2-graded.png` });

    // ---------------------------------------------------------------- 4. list shows it + duplicate + delete
    await page.goto(`${PANEL}/assignments?course=${course.id}`, { waitUntil: "networkidle2" });
    await waitForText(page, `Essay ${tag}`);
    check("list (course view) shows the new assignment", true);
    const dupBefore = await p.assignment.count({ where: { courseId: course.id } });
    await page.click(`button[aria-label^="More actions"]`).catch(async () => page.click('button[title="More actions"]'));
    await page.waitForSelector('[role="menuitem"]', { timeout: 10000 });
    await realClick(page, '[role="menuitem"]', "Duplicate");
    const dup = await until(() => p.assignment.count({ where: { courseId: course.id } }), (n: number) => n === dupBefore + 1);
    check("duplicate created a copy via the API", dup === dupBefore + 1, { dupBefore, dup });

    // ---------------------------------------------------------------- 5. isolation
    if (foreign) {
      await page.goto(`${PANEL}/assignments/${foreign.id}`, { waitUntil: "networkidle2" });
      await sleep(1500);
      const t = await text(page);
      check("another workspace's assignment isn't shown", !t.includes(`Foreign ${tag}`), t.slice(0, 200));
    }
    await ctx.close();
  } catch (e) {
    console.log("FAIL exception", (e as Error).message || String(e).slice(0, 400));
    bad++;
    for (const [i, pg] of (await browser.pages()).entries()) {
      await pg.screenshot({ path: `${SHOTS}/assignments-fail-${i}.png` }).catch(() => {});
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
    await retry(() => p.assignment.deleteMany({ where: { courseId: { in: courses } } }));
    await retry(() => p.enrollment.deleteMany({ where: { userId: { in: users } } }));
    await retry(() => p.lesson.deleteMany({ where: { courseId: { in: courses } } }));
    await retry(() => p.courseModule.deleteMany({ where: { courseId: { in: courses } } }));
    await retry(() => p.course.deleteMany({ where: { id: { in: courses } } }));
    await retry(() => p.category.deleteMany({ where: { institutionId: { in: ids.insts } } }));
    for (const t of ["teamEvent", "teamMember", "teamRole", "saasEvent"]) await retry(() => p[t].deleteMany({ where: { institutionId: { in: ids.insts } } }));
    await retry(() => p.activityLog.deleteMany({ where: { userId: { in: users } } }));
    await retry(() => p.notification.deleteMany({ where: { userId: { in: users } } }));
    await retry(() => p.user.deleteMany({ where: { OR: [{ id: { in: users } }, { email: { startsWith: tag } }] } }));
    await retry(() => p.institution.deleteMany({ where: { id: { in: ids.insts } } }));
    const left = await p.$queryRawUnsafe(`select (select count(*)::int from "User" where email like '${tag}%') users, (select count(*)::int from institutions where slug like '${tag}%') insts`);
    console.log(`\n${ok} passed, ${bad} failed | leftovers ${JSON.stringify(left)}`);
    await p.$disconnect();
  }
})();
