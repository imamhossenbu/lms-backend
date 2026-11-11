/**
 * Browser E2E for teacher course editing + live scheduling in the panel's teacher mode (/teach):
 * Curriculum tab (?tab=curriculum survives reload): add a module, add a TEXT lesson (publishing empty content is
 * refused), edit it, reorder lessons, delete it; Live Classes: schedule (wrong-platform link refused), edit, cancel.
 * API: publish rules, delete guards (learner progress / non-empty module), another teacher's course → 404 on both
 * /teacher and the generic /courses/:id/modules routes (CatalogAccessGuard), recordings only after the class.
 * Panel on :3010 (LIVE_PANEL_URL), API with CORS_ORIGINS for it. Cleanup in `finally`.
 */
import { PANEL, SHOTS, check, cleanup, fill, launch, mkInstitution, mkUser, newTag, prisma as p, realClick, report, retry, text, until, waitForText, type Ids } from "./panel-e2e-helpers";

const API = process.env.LIVE_API_URL ?? "http://localhost:4077";
const tag = newTag();
const loginApi = async (email: string) => (await (await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "Admin12345" }) })).json()).token as string;

(async () => {
  const ids: Ids = { users: [], insts: [] };
  const browser = await launch();
  try {
    const inst = await mkInstitution(ids, tag);
    const teacher = await mkUser(ids, tag, "Cura Teacher", "TEACHER", inst.id);
    const other = await mkUser(ids, tag, "Other Teacher", "TEACHER", inst.id);
    const learner = await mkUser(ids, tag, "Cura Learner", "STUDENT", inst.id);
    const cat = await p.category.create({ data: { name: "Dev", slug: `${tag}-dev`, status: "ACTIVE", institutionId: inst.id } });
    const mk = (title: string, instructorId: string) =>
      p.course.create({ data: { title, slug: title.toLowerCase().replace(/\s+/g, "-"), description: "d", shortDescription: "s", categoryId: cat.id, instructorId, level: "Beginner", language: "English", price: 0, isFree: true, status: "PUBLISHED", durationMinutes: 0, institutionId: inst.id } });
    const mine = await mk(`${tag} Mine Course`, teacher.id);
    const theirs = await mk(`${tag} Their Course`, other.id);
    const m1 = await p.courseModule.create({ data: { courseId: mine.id, title: "Basics", order: 1 } });
    const started = await p.lesson.create({ data: { courseId: mine.id, moduleId: m1.id, title: "Welcome", type: "VIDEO", videoUrl: "https://example.com/v.mp4", durationMinutes: 5, order: 1, status: "PUBLISHED" } });
    await p.lesson.create({ data: { courseId: mine.id, moduleId: m1.id, title: "Second lesson", type: "TEXT", content: "<p>Hi</p>", durationMinutes: 5, order: 2, status: "PUBLISHED" } });
    await p.lessonProgress.create({ data: { userId: learner.id, courseId: mine.id, lessonId: started.id, isCompleted: true, watchedSeconds: 0 } });
    const theirMod = await p.courseModule.create({ data: { courseId: theirs.id, title: "Theirs", order: 1 } });

    // ---------------------------------------------------------------- API rules
    const tok = await loginApi(teacher.email);
    const h = { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" };
    const call = (method: string, path: string, body?: unknown) => fetch(`${API}${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    const base = { moduleId: m1.id, title: "Empty video", type: "VIDEO", durationMinutes: 5, videoUrl: "", content: "", isPreview: false, status: "PUBLISHED" };
    const r1 = await call("POST", `/teacher/courses/${mine.id}/lessons`, base);
    const r2 = await call("POST", `/teacher/courses/${mine.id}/lessons`, { ...base, type: "SLIDES" });
    const r3 = await call("POST", `/teacher/courses/${mine.id}/lessons`, { ...base, videoUrl: "javascript:alert(1)" });
    const r4 = await call("POST", `/teacher/courses/${mine.id}/lessons`, { ...base, type: "TEXT", content: "<p>Safe</p><script>alert(1)</script>", title: "Sanitised" });
    const created = (await r4.json()) as { id: string; content: string };
    check("publish rules + DTO: no video → 400, bad type → 400, js: link → 400; HTML sanitised", r1.status === 400 && r2.status === 400 && r3.status === 400 && r4.status === 201 && !created.content.includes("<script"), [r1.status, r2.status, r3.status, r4.status]);
    const r5 = await call("DELETE", `/teacher/courses/${mine.id}/lessons/${started.id}`);
    const r6 = await call("DELETE", `/teacher/courses/${mine.id}/modules/${m1.id}`);
    check("lesson with learner progress and non-empty module can't be deleted (409)", r5.status === 409 && r6.status === 409, [r5.status, r6.status]);
    const r7 = await call("POST", `/teacher/courses/${theirs.id}/modules`, { title: "Hack" });
    const r8 = await call("POST", `/courses/${theirs.id}/modules`, { title: "Hack", order: 9 });
    const r9 = await call("PATCH", `/courses/${theirs.id}/modules/${theirMod.id}/lessons/x`, { title: "Hack" });
    const r10 = await call("POST", `/courses/${mine.id}/modules`, { title: "Allowed", order: 9 });
    check("another teacher's course → 404 on /teacher and generic /courses routes; own still works", r7.status === 404 && r8.status === 404 && r9.status === 404 && r10.status === 201, [r7.status, r8.status, r9.status, r10.status]);
    await p.courseModule.deleteMany({ where: { courseId: mine.id, title: "Allowed" } });
    await call("DELETE", `/teacher/courses/${mine.id}/lessons/${created.id}`);

    // ---------------------------------------------------------------- browser: curriculum
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(`${PANEL}/login`, { waitUntil: "networkidle2" });
    await fill(page, "#email-address", teacher.email);
    await fill(page, "#password-field", "Admin12345");
    await page.click('button[type="submit"]');
    await until(async () => page.url(), (u) => u.endsWith("/teach"), 60);
    await page.goto(`${PANEL}/teach/courses/${mine.id}?tab=curriculum`, { waitUntil: "networkidle2" });
    await waitForText(page, "Second lesson");
    await page.reload({ waitUntil: "networkidle2" });
    check("Curriculum tab survives reload", (await waitForText(page, "Add module").then(() => text(page))).includes("Module 1"));

    await realClick(page, "button", "Add module");
    await page.waitForSelector("#module-title");
    await fill(page, "#module-title", "Advanced topics");
    await realClick(page, "button", "Add module", true);
    const mod2 = await until(() => p.courseModule.findFirst({ where: { courseId: mine.id, title: "Advanced topics" } }), (m: any) => !!m);
    await page.waitForSelector('button[aria-label="Rename Advanced topics"]', { timeout: 60000 });
    check("module added (order 2)", mod2?.order === 2);

    // Add a TEXT lesson to the new module: publishing with no content is refused in the form.
    await page.evaluate(() => ([...document.querySelectorAll("button")].filter((b) => b.textContent?.trim() === "Add lesson").pop() as HTMLElement)?.click());
    await page.waitForSelector("#lesson-title");
    await fill(page, "#lesson-title", "Closures explained");
    await page.select("#lesson-type", "TEXT");
    await page.evaluate(() => ([...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Published") as HTMLElement)?.click());
    await realClick(page, "button", "Add lesson", true);
    await waitForText(page, "Write the lesson content before publishing it");
    await page.click(".ProseMirror");
    await page.keyboard.type("A closure keeps access to its outer scope.");
    await realClick(page, "button", "Add lesson", true);
    const added = await until(() => p.lesson.findFirst({ where: { courseId: mine.id, title: "Closures explained" } }), (l: any) => !!l);
    check("TEXT lesson added from the form (published, content saved, in module 2)", added?.status === "PUBLISHED" && added.moduleId === mod2.id && (added.content ?? "").includes("outer scope"), [added?.status, added?.moduleId === mod2.id, added?.content]);
    await page.waitForSelector('button[aria-label="Edit Closures explained"]', { timeout: 60000 });
    await page.screenshot({ path: `${SHOTS}/teach-content-1-curriculum.png` });

    // Edit it: rename + back to Draft.
    await page.click('button[aria-label="Edit Closures explained"]');
    await page.waitForFunction(() => (document.querySelector("#lesson-title") as HTMLInputElement | null)?.value === "Closures explained", { timeout: 30000 });
    await fill(page, "#lesson-title", "Closures in depth");
    await page.evaluate(() => ([...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Draft") as HTMLElement)?.click());
    await realClick(page, "button", "Save lesson");
    const edited = await until(() => p.lesson.findUnique({ where: { id: added.id } }), (l: any) => l?.title === "Closures in depth");
    check("lesson edited (title + Draft)", edited?.status === "DRAFT");

    // Reorder module 1: move "Second lesson" up.
    await page.waitForSelector('button[aria-label="Delete Closures in depth"]', { timeout: 60000 });
    await page.click('button[aria-label="Move Second lesson up"]');
    const moved = await until(() => p.lesson.findMany({ where: { moduleId: m1.id }, orderBy: { order: "asc" } }), (ls: any[]) => ls[0]?.title === "Second lesson");
    check("lessons reordered", moved[0].title === "Second lesson" && moved[1].title === "Welcome");

    // Delete the new lesson.
    // Busy state cleared + list reloaded: "Second lesson" is first, so its down arrow is enabled again.
    await page.waitForSelector('button[aria-label="Move Second lesson down"]:not([disabled])', { timeout: 60000 });
    await page.click('button[aria-label="Delete Closures in depth"]');
    await realClick(page, "button", "Delete", true);
    const gone = await until(() => p.lesson.findUnique({ where: { id: added.id } }), (l: any) => !l);
    check("lesson deleted after confirm", !gone);

    // ---------------------------------------------------------------- browser: live classes
    await page.goto(`${PANEL}/teach/live`, { waitUntil: "networkidle2" });
    await realClick(page, "button", "Schedule class");
    await page.waitForSelector("#live-title");
    await page.waitForFunction((t) => [...(document.querySelector("#live-course") as HTMLSelectElement).options].some((o) => o.text === t), { timeout: 30000 }, mine.title);
    await page.select("#live-course", mine.id);
    await fill(page, "#live-title", "Office hours");
    await page.select("#live-platform", "ZOOM");
    await fill(page, "#live-link", "https://meet.google.com/abc-defg-hij");
    await realClick(page, "button", "Schedule class", true);
    await waitForText(page, "This doesn't look like a Zoom link");
    await page.select("#live-platform", "GOOGLE_MEET");
    await realClick(page, "button", "Schedule class", true);
    const live = await until(() => p.liveClass.findFirst({ where: { courseId: mine.id, title: "Office hours" } }), (l: any) => !!l);
    check("class scheduled (wrong-platform link refused first)", live?.instructorId === teacher.id && live.status === "SCHEDULED" && live.meetingUrl === "https://meet.google.com/abc-defg-hij" && live.endTime.getTime() - live.startTime.getTime() === 3600_000);
    await page.waitForSelector('button[aria-label="Edit Office hours"]', { timeout: 60000 });
    await page.screenshot({ path: `${SHOTS}/teach-content-2-live.png` });

    await page.click('button[aria-label="Edit Office hours"]');
    await page.waitForFunction(() => (document.querySelector("#live-title") as HTMLInputElement | null)?.value === "Office hours", { timeout: 30000 });
    await fill(page, "#live-title", "Office hours #1");
    await realClick(page, "button", "Save changes");
    await until(() => p.liveClass.findUnique({ where: { id: live.id } }), (l: any) => l?.title === "Office hours #1");
    await page.waitForSelector('button[aria-label="Cancel Office hours #1"]', { timeout: 60000 });
    await page.click('button[aria-label="Cancel Office hours #1"]');
    await realClick(page, "button", "Cancel class", true);
    const cancelled = await until(() => p.liveClass.findUnique({ where: { id: live.id } }), (l: any) => l?.status === "CANCELLED");
    check("class edited, then cancelled", cancelled?.title === "Office hours #1" && cancelled.status === "CANCELLED");

    // ---------------------------------------------------------------- API: live rules
    const tomorrow = new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10);
    const lv = { courseId: mine.id, title: "Rules", date: tomorrow, startTime: "10:00", durationMinutes: 60, platform: "CUSTOM", meetingUrl: "https://example.com/room" };
    const l1 = await call("POST", "/teacher/live-classes", { ...lv, date: "2020-01-01" });
    const l2 = await call("POST", "/teacher/live-classes", { ...lv, courseId: theirs.id });
    const l3 = await call("POST", "/teacher/live-classes", { ...lv, durationMinutes: 5 });
    const up = (await (await call("POST", "/teacher/live-classes", lv)).json()) as { id: string };
    const l4 = await call("PATCH", `/teacher/live-classes/${up.id}/recording`, { recordingUrl: "https://youtu.be/x" });
    const past = await p.liveClass.create({ data: { institutionId: inst.id, courseId: mine.id, instructorId: teacher.id, title: "Done", meetingUrl: "https://example.com/r", startTime: new Date(Date.now() - 7200_000), endTime: new Date(Date.now() - 3600_000), status: "SCHEDULED" } });
    const l5 = await call("PATCH", `/teacher/live-classes/${past.id}/recording`, { recordingUrl: "https://youtu.be/x" });
    const l6 = await call("PUT", `/teacher/live-classes/${past.id}`, lv);
    check("live rules: past date 400, other's course 404, <15 min 400, recording only after the class (409/200), past class not editable 409", l1.status === 400 && l2.status === 404 && l3.status === 400 && l4.status === 409 && l5.status === 200 && l6.status === 409, [l1.status, l2.status, l3.status, l4.status, l5.status, l6.status]);
  } catch (err) {
    check("suite crashed", false, (err as Error).stack);
    for (const [i, pg] of (await browser.pages()).entries()) await pg.screenshot({ path: `${SHOTS}/teach-content-fail-${i}.png` }).catch(() => {});
  } finally {
    await browser.close();
    await cleanup(ids, tag, async (courses) => {
      await retry(() => p.liveClass.deleteMany({ where: { courseId: { in: courses } } }));
    });
    await report(tag);
  }
})();
