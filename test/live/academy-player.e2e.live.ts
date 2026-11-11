/**
 * Browser E2E for the academy course player (lms-academy-site /learn on :3003, ?academy=<slug>): not enrolled →
 * sent to the course page; enrolled learner sees the outline with progress, a video lesson (native player) and a
 * reading lesson (sanitised HTML — a <script> never runs), ?lesson= survives reloads, "Complete & continue" moves on
 * and updates progress, a PREVIOUS_LESSON prerequisite keeps the next lesson locked until then, the quiz lesson
 * (wrong answers → not passed + try again; right answers → passed → lesson completed), course reaches 100%.
 * Cleanup in `finally`.
 */
import type { Page } from "puppeteer-core";
import { SHOTS, check, cleanup, launch, mkInstitution, mkUser, newTag, prisma as p, report, retry, text, until, waitForText, type Ids } from "./panel-e2e-helpers";

const SITE = process.env.LIVE_ACADEMY_URL ?? "http://localhost:3003";
const API = process.env.LIVE_API_URL ?? "http://localhost:4077";
const tag = newTag();
const ids: Ids = { users: [], insts: [] };
const safeText = (page: Page) => text(page).catch(() => "");
const clickText = (page: Page, label: string) =>
  page.evaluate((l) => {
    const el = [...document.querySelectorAll("a,button")].reverse().find((e) => (e.textContent || "").trim().startsWith(l) && (e as HTMLElement).offsetParent) as HTMLElement | undefined;
    el?.click();
    return !!el;
  }, label);

/** Clicks "Complete & continue" once the page has hydrated (SSR text shows before buttons work). */
async function completeLesson(page: Page) {
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.textContent?.includes("Complete & continue") && !(b as HTMLButtonElement).disabled), { timeout: 30000 });
  await page.waitForNetworkIdle({ idleTime: 500, timeout: 30000 }).catch(() => null);
  await clickText(page, "Complete & continue");
}

(async () => {
  const browser = await launch();
  try {
    const inst = await mkInstitution(ids, `${tag}-learn`);
    const teacher = await mkUser(ids, tag, "Player Teacher", "TEACHER", inst.id);
    const learner = await mkUser(ids, tag, "Player Learner", "STUDENT", inst.id);
    const outsider = await mkUser(ids, tag, "Not Enrolled", "STUDENT", inst.id);
    const cat = await p.category.create({ data: { name: "Dev", slug: `${tag}-dev`, status: "ACTIVE", institutionId: inst.id } });
    const course = await p.course.create({
      data: { title: `${tag} Player Course`, slug: `${tag}-player-course`, description: "d", shortDescription: "s", categoryId: cat.id, instructorId: teacher.id, level: "Beginner", language: "English", price: 0, isFree: true, status: "PUBLISHED", durationMinutes: 30, institutionId: inst.id },
    });
    const mod = await p.courseModule.create({ data: { courseId: course.id, title: "Start here", order: 1 } });
    const mk = (title: string, type: string, order: number, extra: Record<string, unknown> = {}) =>
      p.lesson.create({ data: { courseId: course.id, moduleId: mod.id, title, type, durationMinutes: 5, order, status: "PUBLISHED", ...extra } });
    const video = await mk("Welcome video", "VIDEO", 1, { videoUrl: "https://videos.pexels.com/video-files/6985689/6985689-hd_1920_1080_25fps.mp4", content: "<p>Watch this first.</p>" });
    const reading = await mk("Reading notes", "TEXT", 2, { content: '<p>Important <strong>notes</strong></p><script>window.__pwned = 1</script><img src="x" onerror="window.__pwned = 2">' });
    const gated = await mk("Gated lesson", "TEXT", 3, { content: "<p>Unlocked!</p>", editorSettings: { access: { accessType: "PREVIOUS_LESSON" } } });
    const quizLesson = await mk("Final quiz", "QUIZ", 4);
    await p.quiz.create({
      data: {
        institutionId: inst.id, courseId: course.id, moduleId: mod.id, lessonId: quizLesson.id, title: "Final quiz", passingScore: 20, totalMarks: 20, status: "PUBLISHED", showImmediately: true, showCorrectAnswers: true, showExplanation: true,
        questions: {
          create: [
            { questionText: "2 + 2 = ?", questionType: "MULTIPLE_CHOICE", options: JSON.stringify([{ id: "a", text: "3" }, { id: "b", text: "4" }]), correctAnswer: "", correctOptionIds: ["b"], marks: 10, explanation: "Basic maths.", order: 1 },
            { questionText: "The sky is blue.", questionType: "TRUE_FALSE", options: JSON.stringify([{ id: "t", text: "True" }, { id: "f", text: "False" }]), correctAnswer: "", correctOptionIds: ["t"], marks: 10, order: 2 },
          ],
        },
      },
    });
    await p.enrollment.create({ data: { userId: learner.id, courseId: course.id, status: "ACTIVE" } });

    // Sign in through the site's own API route so the httpOnly session cookie is set.
    const signIn = async (email: string) => {
      const ctx = await browser.createBrowserContext();
      const page = await ctx.newPage();
      await page.setViewport({ width: 1440, height: 900 });
      await page.goto(`${SITE}/?academy=${inst.slug}`, { waitUntil: "networkidle2", timeout: 90000 });
      const ok = await page.evaluate(async (e) => (await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: e, password: "Admin12345" }) })).ok, email);
      return { page, ok };
    };

    // ---------------------------------------------------------------- not enrolled
    const out = await signIn(outsider.email);
    await out.page.goto(`${SITE}/learn/${course.slug}`, { waitUntil: "networkidle2" });
    await until(async () => out.page.url(), (u) => u.includes(`/courses/${course.slug}`));
    check("not enrolled → sent to the course page", out.ok && out.page.url().includes(`/courses/${course.slug}`), out.page.url());

    // ---------------------------------------------------------------- outline + video
    const { page, ok } = await signIn(learner.email);
    check("learner signed in", ok);
    await page.goto(`${SITE}/learn/${course.slug}`, { waitUntil: "networkidle2" });
    const t0 = await waitForText(page, "Course content").then(() => safeText(page));
    check("player: outline, 0 of 4 done, first lesson open", t0.includes("0 of 4 lessons done") && t0.includes("Welcome video") && t0.includes("Gated lesson"));
    check("video lesson plays in a native player", !!(await page.$('video[src*="pexels"]')));
    await page.screenshot({ path: `${SHOTS}/player-1-video.png` });

    // ---------------------------------------------------------------- complete & continue
    await completeLesson(page);
    await until(async () => page.url(), (u) => u.includes(`lesson=${reading.id}`));
    const t1 = await until(() => safeText(page), (t) => t.includes("1 of 4 lessons done") && t.includes("Important notes"));
    check("Complete & continue → next lesson, progress 1/4", t1.includes("25%"));
    check("lesson HTML is sanitised (no script / onerror ran)", !(await page.evaluate(() => (window as any).__pwned)));
    await page.reload({ waitUntil: "networkidle2" });
    check("?lesson= survives a reload", (await waitForText(page, "Important notes").then(() => safeText(page))).includes("Reading notes"));

    // ---------------------------------------------------------------- prerequisite lock
    await page.goto(`${SITE}/learn/${course.slug}?lesson=${gated.id}`, { waitUntil: "networkidle2" });
    const t2 = await waitForText(page, "Complete the previous lesson").then(() => safeText(page));
    check("PREVIOUS_LESSON prerequisite keeps the lesson locked", !t2.includes("Unlocked!"));
    const direct = await page.evaluate(async (u) => (await fetch(u, { method: "POST" })).status, `/api/me/learn/${course.slug}/lessons/${gated.id}/complete`);
    check("a locked lesson can't be completed through the API either (403)", direct === 403, direct);
    await page.goto(`${SITE}/learn/${course.slug}?lesson=${reading.id}`, { waitUntil: "networkidle2" });
    await waitForText(page, "Important notes");
    await completeLesson(page);
    const t3 = await until(() => safeText(page), (t) => t.includes("Unlocked!") && t.includes("2 of 4 lessons done"));
    check("completing the previous lesson unlocks it", t3.includes("2 of 4 lessons done"), t3.slice(-500));
    await until(async () => page.url(), (u) => u.includes(`lesson=${gated.id}`));
    await completeLesson(page);

    // ---------------------------------------------------------------- quiz
    await until(async () => page.url(), (u) => u.includes(`lesson=${quizLesson.id}`));
    await waitForText(page, "2 + 2 = ?");
    const pick = (label: string, nth: number) =>
      page.evaluate(
        (l, n) => ([...document.querySelectorAll('button[role="radio"],button[role="checkbox"]')].filter((b) => b.textContent?.trim() === l)[n] as HTMLElement)?.click(),
        label,
        nth,
      );
    await pick("3", 0);
    await pick("False", 0);
    await clickText(page, "Submit answers");
    const q1 = await until(() => safeText(page), (t) => t.includes("Not passed this time"));
    check("wrong answers → not passed, verdicts + explanation shown", q1.includes("Incorrect") && q1.includes("Basic maths."));
    await page.screenshot({ path: `${SHOTS}/player-2-quiz-fail.png` });
    await clickText(page, "Try again");
    await waitForText(page, "Submit answers");
    await pick("4", 0);
    await pick("True", 0);
    await clickText(page, "Submit answers");
    await until(() => safeText(page), (t) => t.includes("You passed!"));
    const t4 = await until(() => safeText(page), (t) => t.includes("4 of 4 lessons done"));
    check("passing the quiz completes the lesson → 100%", t4.includes("100%"));
    const enr = await p.enrollment.findFirst({ where: { userId: learner.id, courseId: course.id } });
    const attempts = await p.quizAttempt.count({ where: { userId: learner.id } });
    check("enrollment progress 100% + completedAt, 2 quiz attempts stored", enr?.progressPercentage === 100 && !!enr?.completedAt && attempts === 2, { progress: enr?.progressPercentage, attempts });
    await page.screenshot({ path: `${SHOTS}/player-3-done.png` });

    // ---------------------------------------------------------------- isolation
    const other = await (await fetch(`${API}/academy/${inst.slug}/me/learn/${course.slug}`)).status;
    check("player API needs a learner token", other === 401);
  } catch (err) {
    check("suite crashed", false, (err as Error).stack);
    for (const [i, pg] of (await browser.pages()).entries()) await pg.screenshot({ path: `${SHOTS}/player-fail-${i}.png` }).catch(() => {});
  } finally {
    await browser.close();
    await cleanup(ids, tag, async (courses) => {
      await retry(() => p.quizAttempt.deleteMany({ where: { quiz: { courseId: { in: courses } } } }));
      await retry(() => p.quiz.deleteMany({ where: { courseId: { in: courses } } }));
    });
    await report(tag);
  }
})();
