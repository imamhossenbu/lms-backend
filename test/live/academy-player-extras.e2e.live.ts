/**
 * Browser E2E for the course player extras (lms-academy-site /learn on :3003): an ASSIGNMENT lesson submits a link
 * answer from inside the player (validation, then Submitted), a LIVE lesson shows the next class with Join once the
 * link is released, a native video resumes from the saved position, and course Q&A (ask → teacher's reply shows
 * as "Instructor answered"; a learner replies). Cleanup in `finally`.
 */
import type { Page } from "puppeteer-core";
import { SHOTS, check, cleanup, launch, mkInstitution, mkUser, newTag, prisma as p, report, retry, text, until, waitForText, type Ids } from "./panel-e2e-helpers";

const SITE = process.env.LIVE_ACADEMY_URL ?? "http://localhost:3003";
const tag = newTag();
const ids: Ids = { users: [], insts: [] };
const safeText = (page: Page) => text(page).catch(() => "");
const clickText = (page: Page, label: string) =>
  page.evaluate((l) => {
    const el = [...document.querySelectorAll("a,button")].reverse().find((e) => (e.textContent || "").trim().startsWith(l) && (e as HTMLElement).offsetParent) as HTMLElement | undefined;
    el?.click();
    return !!el;
  }, label);
const idle = (page: Page) => page.waitForNetworkIdle({ idleTime: 500, timeout: 30000 }).catch(() => null);

(async () => {
  const browser = await launch();
  try {
    const inst = await mkInstitution(ids, `${tag}-x`);
    const teacher = await mkUser(ids, tag, "Xtra Teacher", "TEACHER", inst.id);
    const learner = await mkUser(ids, tag, "Xtra Learner", "STUDENT", inst.id);
    const cat = await p.category.create({ data: { name: "Dev", slug: `${tag}-dev`, status: "ACTIVE", institutionId: inst.id } });
    const course = await p.course.create({ data: { title: `${tag} Extras`, slug: `${tag}-extras`, description: "d", shortDescription: "s", categoryId: cat.id, instructorId: teacher.id, level: "Beginner", language: "English", price: 0, isFree: true, status: "PUBLISHED", durationMinutes: 30, institutionId: inst.id } });
    const mod = await p.courseModule.create({ data: { courseId: course.id, title: "M1", order: 1 } });
    const lesson = (title: string, type: string, order: number, extra: Record<string, unknown> = {}) => p.lesson.create({ data: { courseId: course.id, moduleId: mod.id, title, type, durationMinutes: 5, order, status: "PUBLISHED", ...extra } });
    const video = await lesson("Intro video", "VIDEO", 1, { videoUrl: "https://videos.pexels.com/video-files/6985689/6985689-hd_1920_1080_25fps.mp4" });
    const asgLesson = await lesson("Share your project", "ASSIGNMENT", 2, { content: "<p>Share it.</p>" });
    const liveLesson = await lesson("Live Q&A", "LIVE", 3);
    const asg = await p.assignment.create({ data: { institutionId: inst.id, courseId: course.id, lessonId: asgLesson.id, title: "Project link", dueDate: new Date(Date.now() + 864e5), marks: 10, allowedFileTypes: "", status: "PUBLISHED", type: "LINK", instructionsHtml: "<p>Paste your GitHub link.</p>" } });
    await p.liveClass.create({ data: { institutionId: inst.id, courseId: course.id, instructorId: teacher.id, title: "Weekly Q&A", meetingUrl: "https://meet.example.com/weekly", startTime: new Date(Date.now() + 5 * 60_000), endTime: new Date(Date.now() + 65 * 60_000), status: "SCHEDULED" } });
    await p.enrollment.create({ data: { userId: learner.id, courseId: course.id, status: "ACTIVE" } });
    await p.lessonProgress.create({ data: { userId: learner.id, courseId: course.id, lessonId: video.id, isCompleted: false, watchedSeconds: 0, lastPosition: 42 } });

    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(`${SITE}/?academy=${inst.slug}`, { waitUntil: "networkidle2", timeout: 90000 });
    await page.evaluate(async (e) => fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: e, password: "Admin12345" }) }), learner.email);

    // ---------------------------------------------------------------- video resume
    await page.goto(`${SITE}/learn/${course.slug}?lesson=${video.id}`, { waitUntil: "networkidle2" });
    check("video resumes from the saved position", (await waitForText(page, "Resuming from 0:42").then(() => true)));
    const saved = await page.evaluate(async (u) => (await fetch(u, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ seconds: 95 }) })).status, `/api/me/learn/${course.slug}/lessons/${video.id}/position`);
    const pos = await p.lessonProgress.findFirst({ where: { userId: learner.id, lessonId: video.id } });
    check("position endpoint saves seconds", saved === 200 && pos?.lastPosition === 95, saved);

    // ---------------------------------------------------------------- assignment in the player
    await page.goto(`${SITE}/learn/${course.slug}?lesson=${asgLesson.id}`, { waitUntil: "networkidle2" });
    await waitForText(page, "Paste your GitHub link.");
    await idle(page);
    await page.type('input[type="url"]', "not a link");
    await clickText(page, "Submit");
    await until(() => safeText(page), (t) => t.includes("Enter a valid link"));
    await page.$eval('input[type="url"]', (e) => (e as HTMLInputElement).select());
    await page.type('input[type="url"]', "https://github.com/learner/project");
    await clickText(page, "Submit");
    const sub = await until(() => p.assignmentSubmission.findFirst({ where: { assignmentId: asg.id, userId: learner.id } }), (s: any) => !!s);
    const t1 = await until(() => safeText(page), (t) => t.includes("Your attempt 1"));
    check("assignment submitted from the lesson (link validated)", sub?.textAnswer === "https://github.com/learner/project" && t1.includes("Your attempt 1"));
    await page.screenshot({ path: `${SHOTS}/extras-1-assignment.png` });

    // ---------------------------------------------------------------- live lesson
    await page.goto(`${SITE}/learn/${course.slug}?lesson=${liveLesson.id}`, { waitUntil: "networkidle2" });
    await waitForText(page, "Weekly Q&A");
    check("LIVE lesson shows the next class with Join", await page.$$eval("a", (as) => as.some((a) => (a as HTMLAnchorElement).href === "https://meet.example.com/weekly")));

    // ---------------------------------------------------------------- Q&A
    await idle(page);
    await clickText(page, "Ask a question");
    await page.waitForSelector("#ask-title");
    await clickText(page, "Post question");
    await until(() => safeText(page), (t) => t.includes("Give your question a short title"));
    await page.type("#ask-title", "How do I deploy?");
    await page.type('textarea[aria-label="Details"]', "I built the project but don't know where to host it.");
    await clickText(page, "Post question");
    const thread = await until(() => p.discussion.findFirst({ where: { courseId: course.id, userId: learner.id } }), (d: any) => !!d);
    check("question posted to the course (QUESTION thread)", thread?.category === "QUESTION" && thread.title === "How do I deploy?");
    await p.discussionReply.create({ data: { discussionId: thread.id, userId: teacher.id, body: "<p>Try Vercel — it's free for hobby projects.</p>" } });
    await page.reload({ waitUntil: "networkidle2" });
    await waitForText(page, "Instructor answered");
    await page.evaluate(() => ([...document.querySelectorAll("button")].find((b) => b.textContent?.includes("How do I deploy?")) as HTMLElement)?.click());
    await waitForText(page, "Try Vercel");
    await page.type('input[aria-label="Reply"]', "Thanks, it worked!");
    await page.click('button[aria-label="Send reply"]');
    const myReply = await until(() => p.discussionReply.findFirst({ where: { discussionId: thread.id, userId: learner.id } }), (r: any) => !!r);
    check("teacher's answer shown as Instructor answered; learner reply saved", !!myReply && myReply.body.includes("Thanks, it worked!"));
    await page.screenshot({ path: `${SHOTS}/extras-2-qa.png` });
  } catch (err) {
    check("suite crashed", false, (err as Error).stack);
    for (const [i, pg] of (await browser.pages()).entries()) await pg.screenshot({ path: `${SHOTS}/extras-fail-${i}.png` }).catch(() => {});
  } finally {
    await browser.close();
    await cleanup(ids, tag, async (courses) => {
      const threads = (await p.discussion.findMany({ where: { courseId: { in: courses } }, select: { id: true } })).map((d: any) => d.id);
      await retry(() => p.discussionReply.deleteMany({ where: { discussionId: { in: threads } } }));
      await retry(() => p.discussion.deleteMany({ where: { id: { in: threads } } }));
      await retry(() => p.assignmentSubmission.deleteMany({ where: { assignment: { courseId: { in: courses } } } }));
      await retry(() => p.assignment.deleteMany({ where: { courseId: { in: courses } } }));
      await retry(() => p.liveClass.deleteMany({ where: { courseId: { in: courses } } }));
    });
    await report(tag);
  }
})();
