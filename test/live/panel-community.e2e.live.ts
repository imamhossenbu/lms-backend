/**
 * Browser E2E for the admin panel Community against the real API: list + stats + moderation queue from the API (no
 * mock data), the New Discussion form on a real course / module, the thread page (view counted, reply as the signed-in
 * admin, accept the answer, pin from the Moderation card), resolving a report, delete from the list, and workspace
 * isolation. Panel on :3010, API on :4077 by default. Cleanup in `finally`.
 */
import "dotenv/config";
import * as bcrypt from "bcrypt";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { PrismaService } from "../../src/prisma/prisma.service";

const PANEL = process.env.LIVE_PANEL_URL ?? "http://localhost:3010";
const SHOTS = process.env.LIVE_SHOTS_DIR ?? require("os").tmpdir();
const p: any = new PrismaService();
const tag = `e2ecom${Date.now().toString(36)}`;
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
    const admin = await mkUser("Forum Admin", "ADMIN", inst.id);
    const asker = await mkUser("Asker Student", "STUDENT", inst.id);
    const reporter = await mkUser("Reporter Student", "STUDENT", inst.id);
    const otherAdmin = await mkUser("Other Admin", "ADMIN", other.id);
    const mkCourse = async (institutionId: string, title: string, instructorId: string) => {
      const cat = await p.category.create({ data: { name: `Cat ${title}`, slug: `cat-${title.toLowerCase().replace(/\s+/g, "-")}`, status: "ACTIVE", institutionId } });
      const course = await p.course.create({ data: { title, slug: title.toLowerCase().replace(/\s+/g, "-"), description: "d", shortDescription: "s", categoryId: cat.id, instructorId, level: "Beginner", language: "English", price: 0, isFree: true, status: "PUBLISHED", durationMinutes: 60, institutionId } });
      const mod = await p.courseModule.create({ data: { courseId: course.id, title: `Layouts ${title}`, order: 1 } });
      return { course, mod };
    };
    const { course, mod } = await mkCourse(inst.id, `Forum Course ${tag}`, admin.id);
    const { course: otherCourse } = await mkCourse(other.id, `Other Course ${tag}`, otherAdmin.id);
    for (const u of [asker, reporter]) await p.enrollment.create({ data: { userId: u.id, courseId: course.id, status: "ACTIVE" } });

    // A student's question with one student reply and an open report on the thread.
    const question = await p.discussion.create({
      data: { institutionId: inst.id, courseId: course.id, moduleId: mod.id, userId: asker.id, title: `Why does my grid overflow ${tag}`, body: "<p>My grid layout overflows on small screens, what am I missing?</p>", category: "QUESTION", tags: "css,grid", updatedAt: new Date() },
    });
    await p.discussionReply.create({ data: { discussionId: question.id, userId: reporter.id, body: "<p>Try minmax(0, 1fr) for the columns.</p>" } });
    const report = await p.discussionReport.create({ data: { institutionId: inst.id, threadId: question.id, targetType: "THREAD", targetId: question.id, reporterId: reporter.id, reason: "OFF_TOPIC", note: "Belongs in another module" } });
    const foreign = await p.discussion.create({ data: { institutionId: other.id, courseId: otherCourse.id, userId: otherAdmin.id, title: `Foreign thread ${tag}`, body: "<p>Not yours to see at all, really.</p>", category: "DISCUSSION", updatedAt: new Date() } });

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

    // ---------------------------------------------------------------- 1. list + stats + moderation queue
    await page.goto(`${PANEL}/community`, { waitUntil: "networkidle2" });
    await waitForText(page, `Why does my grid overflow ${tag}`);
    await sleep(800);
    const t1 = await text(page);
    check("list shows this workspace's discussion from the API (no mock / foreign threads)", !t1.includes(`Foreign thread ${tag}`) && !t1.includes("flexbox layout overflow on mobile?\n") && t1.includes(`Forum Course ${tag}`), t1.slice(0, 300));
    {
      const pageReqs = listRequests.filter((u) => /\/admin\/community\/threads\?/.test(u) && !/\/(stats|activity|eligible|learners|export)\b/.test(u));
      check("the discussions list asks the API for one page (page + limit)", pageReqs.length > 0 && pageReqs.every((u) => /[?&]page=\d+/.test(u) && /[?&]limit=\d+/.test(u) && !/limit=100\b/.test(u)), pageReqs.slice(0, 3));
    }
    const queue = await page.evaluate(() => [...document.querySelectorAll("section, div")].map((e) => (e as HTMLElement).innerText).find((s) => s.startsWith("Moderation Queue")) ?? "");
    check("moderation queue (API) lists the reported discussion", queue.includes(`Why does my grid overflow ${tag}`) && queue.includes("Off-topic"), queue.slice(0, 200));
    await page.screenshot({ path: `${SHOTS}/community-1-list.png` });

    // ---------------------------------------------------------------- 2. New Discussion on the real course / module
    await page.goto(`${PANEL}/community/new`, { waitUntil: "networkidle2" });
    await page.waitForSelector("#thread-title");
    await fill(page, "#thread-title", `Weekly layout clinic ${tag}`);
    await pick(page, "Select a course", `Forum Course ${tag}`);
    await sleep(1500); // the course's modules load from the API
    await pick(page, "Course-wide", `Layouts Forum Course ${tag}`);
    const editor = await page.$("#thread-body .ProseMirror");
    if (!editor) throw new Error("body editor not found");
    await editor.click();
    await page.keyboard.type("Bring your layout bugs every Thursday and we will fix them together.");
    await sleep(400);
    await realClick(page, "button", "Publish Discussion", true);
    const created = await until(() => p.discussion.findFirst({ where: { title: `Weekly layout clinic ${tag}` } }), (d: any) => !!d);
    check("discussion created via the API as the signed-in admin on the real course / module", created?.userId === admin.id && created?.courseId === course.id && created?.moduleId === mod.id && created?.institutionId === inst.id, created && { userId: created.userId, moduleId: created.moduleId });

    // ---------------------------------------------------------------- 3. thread page: view, reply, accept, pin
    await page.goto(`${PANEL}/community/${question.id}`, { waitUntil: "networkidle2" });
    await waitForText(page, `Why does my grid overflow ${tag}`);
    await waitForText(page, `Layouts Forum Course ${tag}`);
    const viewed = await until(() => p.discussion.findUnique({ where: { id: question.id } }), (d: any) => d?.views === 1);
    check("thread page shows the real course / module and counts the view", viewed?.views === 1, viewed && { views: viewed.views });
    check("composer replies as the signed-in admin", (await text(page)).includes("Reply as Forum Admin"));
    const editors = await page.$$(".ProseMirror");
    await editors[editors.length - 1].click();
    await page.keyboard.type("Good tip. Also check that the container has min-width: 0.");
    await realClick(page, "button", "Post Reply", true);
    const myReply = await until(() => p.discussionReply.findFirst({ where: { discussionId: question.id, userId: admin.id } }), (r: any) => !!r);
    check("reply posted via the API by the admin", !!myReply);
    await waitForText(page, "min-width: 0");
    await realClick(page, "button", "Mark as answer");
    const accepted = await until(() => p.discussionReply.findFirst({ where: { discussionId: question.id, isAccepted: true } }), (r: any) => !!r);
    check("an answer was accepted", !!accepted);
    const pinSwitch = await page.evaluateHandle(() => {
      const row = [...document.querySelectorAll("div")].find((d) => (d as HTMLElement).innerText.trim().startsWith("Pinned") && d.querySelector('[role="switch"]'));
      return row?.querySelector('[role="switch"]') ?? null;
    });
    if (!pinSwitch.asElement()) throw new Error("Pinned switch not found");
    await (pinSwitch.asElement() as any).click();
    const pinned = await until(() => p.discussion.findUnique({ where: { id: question.id } }), (d: any) => d?.isPinned === true);
    check("pin from the Moderation card (PATCH flags)", pinned?.isPinned === true);
    await page.screenshot({ path: `${SHOTS}/community-2-thread.png` });

    // ---------------------------------------------------------------- 4. resolve the report
    await page.goto(`${PANEL}/community/${question.id}?tab=reports`, { waitUntil: "networkidle2" });
    await waitForText(page, "Belongs in another module");
    await realClick(page, "button", "Review", true);
    await page.waitForSelector('[role="dialog"]', { timeout: 10000 });
    await realClick(page, '[role="dialog"] [role="radio"]', "Dismiss report");
    await realClick(page, '[role="dialog"] button', "Resolve Report", true);
    const resolved = await until(() => p.discussionReport.findUnique({ where: { id: report.id } }), (r: any) => r?.status === "DISMISSED");
    check("report dismissed via the API", resolved?.status === "DISMISSED", resolved && { status: resolved.status });

    // ---------------------------------------------------------------- 5. delete from the list (table view)
    await page.goto(`${PANEL}/community?view=table`, { waitUntil: "networkidle2" });
    await waitForText(page, `Weekly layout clinic ${tag}`);
    const menuBtn = await page.evaluateHandle((t) => {
      const r = [...document.querySelectorAll("tr")].find((x) => (x as HTMLElement).innerText.includes(t));
      return r?.querySelector('button[aria-label*="ctions"], button[title*="ctions"]') ?? null;
    }, `Weekly layout clinic ${tag}`);
    if (!menuBtn.asElement()) throw new Error("row menu not found");
    await (menuBtn.asElement() as any).click();
    await page.waitForSelector('[role="menuitem"]', { timeout: 10000 });
    await realClick(page, '[role="menuitem"]', "Delete");
    await page.waitForSelector('[role="dialog"]', { timeout: 10000 });
    await realClick(page, '[role="dialog"] button', "Delete Discussion", true);
    const gone = await until(() => p.discussion.findUnique({ where: { id: created.id } }), (d: any) => !d);
    check("delete removed the discussion via the API", !gone);
    await page.screenshot({ path: `${SHOTS}/community-3-table.png` });

    // ---------------------------------------------------------------- 6. isolation
    await page.goto(`${PANEL}/community/${foreign.id}`, { waitUntil: "networkidle2" });
    await sleep(2000);
    check("another workspace's discussion isn't shown", !(await text(page)).includes(`Foreign thread ${tag}`));
    await ctx.close();
  } catch (e) {
    console.log("FAIL exception", (e as Error).message || String(e).slice(0, 400));
    bad++;
    for (const [i, pg] of (await browser.pages()).entries()) {
      await pg.screenshot({ path: `${SHOTS}/community-fail-${i}.png` }).catch(() => {});
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
    const threads = (await p.discussion.findMany({ where: { courseId: { in: courses } }, select: { id: true } })).map((d: any) => d.id);
    await retry(() => p.discussionReport.deleteMany({ where: { threadId: { in: threads } } }));
    await retry(() => p.discussionReply.deleteMany({ where: { discussionId: { in: threads } } }));
    await retry(() => p.discussion.deleteMany({ where: { id: { in: threads } } }));
    await retry(() => p.enrollment.deleteMany({ where: { courseId: { in: courses } } }));
    await retry(() => p.lesson.deleteMany({ where: { courseId: { in: courses } } }));
    await retry(() => p.courseModule.deleteMany({ where: { courseId: { in: courses } } }));
    await retry(() => p.course.deleteMany({ where: { id: { in: courses } } }));
    await retry(() => p.category.deleteMany({ where: { institutionId: { in: ids.insts } } }));
    await retry(() => p.notification.deleteMany({ where: { userId: { in: users } } }));
    for (const t of ["teamEvent", "teamMember", "teamRole", "saasEvent"]) await retry(() => p[t].deleteMany({ where: { institutionId: { in: ids.insts } } }));
    await retry(() => p.activityLog.deleteMany({ where: { userId: { in: users } } }));
    await retry(() => p.user.deleteMany({ where: { OR: [{ id: { in: users } }, { email: { startsWith: tag } }] } }));
    await retry(() => p.institution.deleteMany({ where: { id: { in: ids.insts } } }));
    const left = await p.$queryRawUnsafe(
      `select (select count(*)::int from "User" where email like '${tag}%') users, (select count(*)::int from institutions where slug like '${tag}%') insts, (select count(*)::int from "Discussion" where title like '%${tag}') threads`,
    );
    console.log(`\n${ok} passed, ${bad} failed | leftovers ${JSON.stringify(left)}`);
    await p.$disconnect();
  }
})();
