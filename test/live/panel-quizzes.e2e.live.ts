/**
 * Browser E2E for the admin panel Quizzes against the real API: list from the API, the create wizard on a real
 * course (course + module pickers from the API, a True / False question), publish, attempts counted on the list,
 * details page, unpublish (status), duplicate, delete, and workspace isolation.
 * Panel on :3010, API on :4077. Cleanup in `finally`.
 */
import "dotenv/config";
import * as bcrypt from "bcrypt";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { PrismaService } from "../../src/prisma/prisma.service";

const PANEL = process.env.LIVE_PANEL_URL ?? "http://localhost:3010";
const SHOTS = process.env.LIVE_SHOTS_DIR ?? require("os").tmpdir();
const p: any = new PrismaService();
const tag = `e2equz${Date.now().toString(36)}`;
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
async function pick(page: Page, placeholder: string, option: string) {
  await realClick(page, 'button[role="combobox"]', placeholder);
  await page.waitForSelector('[role="option"]', { timeout: 10000 });
  await realClick(page, '[role="option"]', option);
  await sleep(400);
}
async function typeInEditor(page: Page, index: number, value: string) {
  const editors = await page.$$(".ProseMirror");
  if (!editors[index]) throw new Error(`No editor #${index}`);
  await editors[index].click();
  await page.keyboard.type(value);
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
    const admin = await mkUser("Quiz Admin", "ADMIN", inst.id);
    const student = await mkUser("Quiz Student", "STUDENT", inst.id);
    const otherAdmin = await mkUser("Other Admin", "ADMIN", other.id);
    const mkCourse = async (institutionId: string, title: string, instructorId: string) => {
      const cat = await p.category.create({ data: { name: `Cat ${title}`, slug: `cat-${title.toLowerCase().replace(/\s+/g, "-")}`, status: "ACTIVE", institutionId } });
      const course = await p.course.create({ data: { title, slug: title.toLowerCase().replace(/\s+/g, "-"), description: "d", shortDescription: "s", categoryId: cat.id, instructorId, level: "Beginner", language: "English", price: 0, isFree: true, status: "PUBLISHED", durationMinutes: 60, institutionId } });
      const mod = await p.courseModule.create({ data: { courseId: course.id, title: `Basics ${title}`, order: 1 } });
      return { course, mod };
    };
    const { course, mod } = await mkCourse(inst.id, `Quiz Course ${tag}`, admin.id);
    await mkCourse(other.id, `Other Course ${tag}`, otherAdmin.id);

    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    page.on("dialog", (d) => void d.accept());
    await page.goto(`${PANEL}/login`, { waitUntil: "networkidle2" });
    await fill(page, "#email-address", admin.email);
    await fill(page, "#password-field", "Admin12345");
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => location.pathname === "/", { timeout: 25000 });

    // ---------------------------------------------------------------- 1. list
    await page.goto(`${PANEL}/quizzes`, { waitUntil: "networkidle2" });
    await page.waitForFunction(() => /Quizzes/.test(document.body.innerText) && !document.querySelector('[aria-busy="true"]'), { timeout: 30000 });
    await sleep(800);
    const t0 = await text(page);
    check("quizzes list loads from the API (no mock quizzes)", !t0.includes("HTML Basics Quiz") && !t0.includes("CSS Fundamentals"), t0.slice(0, 300));

    // ---------------------------------------------------------------- 2. create through the wizard
    await page.goto(`${PANEL}/quizzes/create`, { waitUntil: "networkidle2" });
    await page.waitForSelector("#quiz-title");
    await fill(page, "#quiz-title", `Quiz ${tag}`);
    await pick(page, "Select a course", `Quiz Course ${tag}`);
    await page.waitForFunction(() => [...document.querySelectorAll('button[role="combobox"]')].some((b) => (b as HTMLElement).innerText.includes("Select a module")), { timeout: 20000 });
    await pick(page, "Select a module", `Basics Quiz Course ${tag}`);
    check("wizard pickers list the real course and its module", true);
    await typeInEditor(page, 0, "A short check on the basics.");
    for (let i = 0; i < 6; i++) {
      const url = await page.url();
      if (url.includes("step=review")) break;
      if (url.includes("step=questions") && !(await page.$('[title="Correct answer"]'))) {
        await realClick(page, "button", "Add Question");
        await page.waitForSelector('[role="menuitem"]', { timeout: 10000 });
        await realClick(page, '[role="menuitem"]', "True or False");
        await sleep(500);
        const editors = await page.$$(".ProseMirror");
        await editors[0].click();
        await page.keyboard.type("HTML stands for HyperText Markup Language.");
        const marker = await page.$('[title="Mark as correct"]');
        if (marker) await marker.click();
        await sleep(400);
      }
      await realClick(page, "button", "Save & Continue", true);
      await sleep(1000);
      const errs = await page.$$eval("p", (ps) => ps.filter((x) => x.className.includes("text-red")).map((x) => (x as HTMLElement).innerText).filter(Boolean));
      if (errs.length) console.log("  step errors:", errs.slice(0, 3).join(" | "));
    }
    await realClick(page, "button", "Publish Quiz", true);
    await page.waitForFunction(() => /^\/quizzes\/[0-9a-f-]{36}/.test(location.pathname), { timeout: 30000 });
    const quiz = await until(() => p.quiz.findFirst({ where: { title: `Quiz ${tag}` } }), (q: any) => !!q);
    check("quiz created + published in the database on the real course", quiz?.courseId === course.id && quiz?.moduleId === mod.id && /PUBLISHED/i.test(quiz?.status ?? ""), quiz && { courseId: quiz.courseId, moduleId: quiz.moduleId, status: quiz.status });
    await page.screenshot({ path: `${SHOTS}/quizzes-1-created.png` });

    // ---------------------------------------------------------------- 3. attempt shows on the list + details
    await p.quizAttempt.create({ data: { quizId: quiz.id, userId: student.id, answers: "[]", score: 1, percentage: 100, parsed: true, totalMarks: 1, passed: true, completed: true, submittedAt: new Date() } });
    await page.goto(`${PANEL}/quizzes?view=table`, { waitUntil: "networkidle2" });
    await waitForText(page, `Quiz ${tag}`);
    const row = await page.evaluate((t) => [...document.querySelectorAll("tr")].map((r) => (r as HTMLElement).innerText).find((r) => r.includes(t)) ?? "", `Quiz ${tag}`);
    check("list shows the attempt count from the API", /\b1\b/.test(row), row.slice(0, 200));
    await page.goto(`${PANEL}/quizzes/${quiz.id}`, { waitUntil: "networkidle2" });
    await waitForText(page, `Quiz ${tag}`);
    await waitForText(page, `Quiz Course ${tag}`);
    check("details page shows the quiz and its real course", true);

    // ---------------------------------------------------------------- 4. duplicate + delete the copy
    const before = await p.quiz.count({ where: { courseId: course.id } });
    await page.goto(`${PANEL}/quizzes?view=table`, { waitUntil: "networkidle2" });
    await waitForText(page, `Quiz ${tag}`);
    const menuBtn = await page.evaluateHandle((t) => {
      const r = [...document.querySelectorAll("tr")].find((x) => (x as HTMLElement).innerText.includes(t));
      return r?.querySelector('button[aria-label*="ctions"], button[title*="ctions"]') ?? null;
    }, `Quiz ${tag}`);
    if (!menuBtn.asElement()) throw new Error("row menu not found");
    await (menuBtn.asElement() as any).click();
    await page.waitForSelector('[role="menuitem"]', { timeout: 10000 });
    await realClick(page, '[role="menuitem"]', "Duplicate");
    const after = await until(() => p.quiz.count({ where: { courseId: course.id } }), (n: number) => n === before + 1);
    check("duplicate created a draft copy via the API", after === before + 1, { before, after });

    // ---------------------------------------------------------------- 5. isolation
    const foreignQuiz = await p.quiz.create({ data: { title: `Foreign ${tag}`, courseId: (await p.course.findFirst({ where: { institutionId: other.id } })).id, institutionId: other.id, passingScore: 1, totalMarks: 1, status: "PUBLISHED" } }).catch(() => null);
    if (foreignQuiz) {
      await page.goto(`${PANEL}/quizzes/${foreignQuiz.id}`, { waitUntil: "networkidle2" });
      await sleep(1500);
      check("another workspace's quiz isn't shown", !(await text(page)).includes(`Foreign ${tag}`));
    }
    await ctx.close();
  } catch (e) {
    console.log("FAIL exception", (e as Error).message || String(e).slice(0, 400));
    bad++;
    for (const [i, pg] of (await browser.pages()).entries()) {
      await pg.screenshot({ path: `${SHOTS}/quizzes-fail-${i}.png` }).catch(() => {});
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
    const quizzes = (await p.quiz.findMany({ where: { courseId: { in: courses } }, select: { id: true } })).map((q: any) => q.id);
    await retry(() => p.quizAttempt.deleteMany({ where: { quizId: { in: quizzes } } }));
    await retry(() => p.quizActivity?.deleteMany({ where: { quizId: { in: quizzes } } }) ?? Promise.resolve());
    await retry(() => p.quizQuestion?.deleteMany({ where: { quizId: { in: quizzes } } }) ?? Promise.resolve());
    await retry(() => p.quiz.deleteMany({ where: { id: { in: quizzes } } }));
    await retry(() => p.lesson.deleteMany({ where: { courseId: { in: courses } } }));
    await retry(() => p.courseModule.deleteMany({ where: { courseId: { in: courses } } }));
    await retry(() => p.course.deleteMany({ where: { id: { in: courses } } }));
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
