/**
 * Browser E2E for the admin panel Lesson editor (/courses/:id/lessons/:lessonId/edit) against the real API:
 * loads the real lesson + course curriculum, zod validation, Content save (title / duration), Media video URL with
 * `?tab=` kept across reloads, Settings free preview, Resources (existing one listed, new external link saved),
 * resource description / visibility / order, editor settings (SEO) on the server — read back in a fresh browser,
 * staff-only for the API — moving the lesson to another module and workspace isolation. Panel on :3010, API on :4077 by default.
 */
import { PANEL, SHOTS, check, cleanup, dumpPages, fill, launch, login, mkCourse, mkInstitution, mkUser, newTag, pick, prisma as p, realClick, report, result, sleep, text, until, waitForText, type Ids } from "./panel-e2e-helpers";

const tag = newTag();
const API = process.env.LIVE_API_URL ?? "http://localhost:4077";
async function api(token: string | null, method: string, path: string, body?: unknown) {
  const res = await fetch(`${API}${path}`, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: (await res.json().catch(() => null)) as any };
}
const lessonRow = (id: string) => p.lesson.findUnique({ where: { id }, include: { lessonResources: true } });

(async () => {
  const ids: Ids = { users: [], insts: [] };
  const browser = await launch();
  try {
    const inst = await mkInstitution(ids, tag);
    const other = await mkInstitution(ids, `${tag}-other`);
    const admin = await mkUser(ids, tag, "Lesson Admin", "ADMIN", inst.id);
    const otherAdmin = await mkUser(ids, tag, "Other Admin", "ADMIN", other.id);
    const course = await mkCourse(inst.id, `Lesson Course ${tag}`, admin.id);
    const modA = await p.courseModule.create({ data: { courseId: course.id, title: `Module Alpha ${tag}`, order: 1 } });
    const modB = await p.courseModule.create({ data: { courseId: course.id, title: `Module Beta ${tag}`, order: 2 } });
    const lesson = await p.lesson.create({
      data: { courseId: course.id, moduleId: modA.id, title: `Lesson One ${tag}`, type: "TEXT", content: "<p>Old body</p>", durationMinutes: 10, order: 1, status: "DRAFT" },
    });
    await p.lessonResource.create({ data: { lessonId: lesson.id, title: `Old Sheet ${tag}`, fileUrl: "https://example.com/old.pdf", fileType: "PDF", size: "1 MB" } });
    const student = await mkUser(ids, tag, "Lesson Student", "STUDENT", inst.id);
    await p.enrollment.create({ data: { userId: student.id, courseId: course.id, status: "ACTIVE" } });
    const foreignCourse = await mkCourse(other.id, `Foreign Course ${tag}`, otherAdmin.id);
    const fMod = await p.courseModule.create({ data: { courseId: foreignCourse.id, title: "Foreign Module", order: 1 } });
    const foreignLesson = await p.lesson.create({ data: { courseId: foreignCourse.id, moduleId: fMod.id, title: `Foreign Lesson ${tag}`, type: "TEXT", durationMinutes: 5, order: 1, status: "DRAFT" } });

    const { ctx, page } = await login(browser, admin.email);
    const url = (q = "") => `${PANEL}/courses/${course.id}/lessons/${lesson.id}/edit${q}`;
    const save = async () => {
      await realClick(page, "button", "Update Lesson");
    };

    // ---------------------------------------------------------------- 1. load
    await page.goto(url(), { waitUntil: "networkidle2" });
    await page.waitForSelector("#lesson-title", { timeout: 30000 });
    await until(() => page.$eval("#lesson-title", (e) => (e as HTMLInputElement).value), (v) => v === `Lesson One ${tag}`);
    const t0 = await text(page);
    check("editor loads the real lesson", (await page.$eval("#lesson-title", (e) => (e as HTMLInputElement).value)) === `Lesson One ${tag}` && t0.includes("Old body"), t0.slice(0, 200));
    check("editor shows the real course + module", t0.includes(`Lesson Course ${tag}`) && t0.includes(`Module Alpha ${tag}`));
    await page.screenshot({ path: `${SHOTS}/lesson-1-content.png` });

    // ---------------------------------------------------------------- 2. validation
    await fill(page, "#lesson-title", "");
    await save();
    await waitForText(page, "Please fix the highlighted fields");
    check("empty title is refused and nothing is saved", (await lessonRow(lesson.id))?.title === `Lesson One ${tag}`);

    // ---------------------------------------------------------------- 3. content save
    await fill(page, "#lesson-title", `Lesson Renamed ${tag}`);
    await fill(page, "#lesson-duration", "25");
    await save();
    const l3 = await until(() => lessonRow(lesson.id), (l: any) => l?.title === `Lesson Renamed ${tag}`);
    check("content saved via the API (title, duration)", l3?.title === `Lesson Renamed ${tag}` && l3?.durationMinutes === 25, { title: l3?.title, d: l3?.durationMinutes });
    await waitForText(page, "Lesson updated");

    // ---------------------------------------------------------------- 4. media: video URL + ?tab= across reloads
    await page.goto(url("?tab=media"), { waitUntil: "networkidle2" });
    await waitForText(page, "Lesson Video");
    await page.reload({ waitUntil: "networkidle2" });
    await waitForText(page, "Lesson Video");
    check("?tab=media stays open after a reload", new URL(page.url()).searchParams.get("tab") === "media" && (await text(page)).includes("YouTube"));
    await realClick(page, "button", "YouTube", true);
    await page.waitForSelector("#lesson-video-url", { timeout: 15000 });
    const video = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
    await fill(page, "#lesson-video-url", video);
    await sleep(300);
    await save();
    const l4 = await until(() => lessonRow(lesson.id), (l: any) => l?.videoUrl === video);
    check("video URL saved via the API", l4?.videoUrl === video, l4?.videoUrl);
    await waitForText(page, "Lesson updated");

    // ---------------------------------------------------------------- 5. settings: free preview
    await page.goto(url("?tab=settings"), { waitUntil: "networkidle2" });
    await waitForText(page, "Free Preview");
    await page.evaluate(() => {
      const row = [...document.querySelectorAll<HTMLElement>("*")].find((e) => e.childElementCount === 0 && e.innerText?.trim() === "Free Preview");
      let el: HTMLElement | null = row ?? null;
      while (el && !el.querySelector('[role="switch"]')) el = el.parentElement;
      el?.querySelector<HTMLElement>('[role="switch"]')?.setAttribute("data-e2e", "free-preview");
    });
    const before = await page.$eval('[data-e2e="free-preview"]', (e) => e.getAttribute("aria-checked"));
    await page.click('[data-e2e="free-preview"]');
    await save();
    const l5 = await until(() => lessonRow(lesson.id), (l: any) => l?.isPreview === (before !== "true"));
    check("free preview saved via the API", l5?.isPreview === (before !== "true"), { before, now: l5?.isPreview });
    await waitForText(page, "Lesson updated");

    // ---------------------------------------------------------------- 6. resources: list + add a link
    await page.goto(url("?tab=resources"), { waitUntil: "networkidle2" });
    await waitForText(page, `Old Sheet ${tag}`);
    check("existing resource comes from the API", (await text(page)).includes(`Old Sheet ${tag}`));
    await pick(page, "File Upload", "External Link");
    await page.waitForSelector("#resource-url");
    await fill(page, "#resource-title", `Guide Link ${tag}`);
    await fill(page, "#resource-url", "https://example.com/e2e-guide");
    await fill(page, "#resource-description", "Read this before the lesson");
    await realClick(page, "button", "Add Resource", true);
    await waitForText(page, `Guide Link ${tag}`);
    await page.click(`button[aria-label^="Old Sheet ${tag} is visible"]`);
    await save();
    const l6 = await until(() => lessonRow(lesson.id), (l: any) => l?.lessonResources?.length === 2 && l.lessonResources.some((r: any) => !r.isVisible));
    const link = l6?.lessonResources?.find((r: any) => r.title === `Guide Link ${tag}`);
    const old = l6?.lessonResources?.find((r: any) => r.title === `Old Sheet ${tag}`);
    check("new link resource saved via the API", !!link && link.fileUrl === "https://example.com/e2e-guide", l6?.lessonResources);
    check("resource description, visibility and order saved", link?.description === "Read this before the lesson" && old?.isVisible === false && old?.order === 0 && link?.order === 1, l6?.lessonResources?.map((r: any) => ({ t: r.title, d: r.description, v: r.isVisible, o: r.order })));
    await waitForText(page, "Lesson updated");
    await page.screenshot({ path: `${SHOTS}/lesson-2-resources.png` });

    // ---------------------------------------------------------------- 6b. editor settings on the server (SEO)
    await page.goto(url("?tab=seo"), { waitUntil: "networkidle2" });
    await page.waitForSelector("#seo-title", { timeout: 30000 });
    const seoTitle = `SEO Title ${tag}`;
    await fill(page, "#seo-title", seoTitle);
    await save();
    const l6b = await until(() => p.lesson.findUnique({ where: { id: lesson.id }, omit: { editorSettings: false } }), (l: any) => l?.editorSettings?.seo?.title === seoTitle);
    check("editor settings (SEO) saved on the server", (l6b as any)?.editorSettings?.seo?.title === seoTitle, (l6b as any)?.editorSettings?.seo);
    await waitForText(page, "Lesson updated");
    // A fresh browser profile has no local draft: the value must come from the API.
    const fresh = await login(browser, admin.email);
    await fresh.page.goto(url("?tab=seo"), { waitUntil: "networkidle2" });
    await fresh.page.waitForSelector("#seo-title", { timeout: 30000 });
    const freshSeo = await until(() => fresh.page.$eval("#seo-title", (e) => (e as HTMLInputElement).value), (v) => v === seoTitle);
    const freshTab = await fresh.page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("edupro_lesson_editor")).length);
    check("another browser reads the editor settings from the API", freshSeo === seoTitle && freshTab === 0, { freshSeo, freshTab });
    await fresh.ctx.close();
    const st = await api(null, "POST", "/auth/login", { email: student.email, password: "Admin12345" });
    const asStudent = await api(st.body?.token, "GET", `/courses/${course.id}/modules/${modA.id}/lessons/${lesson.id}`);
    check(
      "students get neither editor settings nor hidden resources",
      asStudent.status === 200 && !("editorSettings" in (asStudent.body ?? {})) && (asStudent.body?.lessonResources ?? []).every((r: any) => r.title !== `Old Sheet ${tag}`) && (asStudent.body?.lessonResources ?? []).length === 1,
      { status: asStudent.status, keys: Object.keys(asStudent.body ?? {}), res: asStudent.body?.lessonResources?.map((r: any) => r.title) },
    );
    const pub = await api(null, "GET", `/courses/${course.id}?institution=${inst.slug}`);
    const pubLessons = (pub.body?.modules ?? []).flatMap((m: any) => m.lessons ?? []);
    check("public course detail hides editor settings and hidden resources", pub.status === 200 && pubLessons.length > 0 && pubLessons.every((l: any) => !("editorSettings" in l) && (l.lessonResources ?? []).every((r: any) => r.isVisible !== false)), { status: pub.status, n: pubLessons.length });

    // ---------------------------------------------------------------- 7. move to another module
    await page.goto(url(), { waitUntil: "networkidle2" });
    await page.waitForSelector("#lesson-title");
    await until(() => page.$eval("#lesson-title", (e) => (e as HTMLInputElement).value), (v) => v === `Lesson Renamed ${tag}`);
    await pick(page, `Module Alpha ${tag}`, `Module Beta ${tag}`);
    await save();
    const l7 = await until(() => lessonRow(lesson.id), (l: any) => l?.moduleId === modB.id);
    check("lesson moved to the other module via the API", l7?.moduleId === modB.id && l7?.title === `Lesson Renamed ${tag}` && l7?.lessonResources?.length === 2, { m: l7?.moduleId });
    await waitForText(page, "Lesson updated");

    // ---------------------------------------------------------------- 8. isolation
    await page.goto(`${PANEL}/courses/${foreignCourse.id}/lessons/${foreignLesson.id}/edit`, { waitUntil: "networkidle2" });
    await sleep(2500);
    const tIso = await text(page);
    const isoTitle = await page.$eval("#lesson-title", (e) => (e as HTMLInputElement).value).catch(() => "");
    check("another workspace's lesson can't be opened", !tIso.includes(`Foreign Lesson ${tag}`) && isoTitle !== `Foreign Lesson ${tag}`, tIso.slice(0, 200));
    await ctx.close();
  } catch (e) {
    console.log("FAIL exception", (e as Error).message || String(e).slice(0, 400));
    result.bad++;
    await dumpPages(browser, "lesson");
  } finally {
    await browser.close();
    await cleanup(ids, tag);
    await report(tag, `, (select count(*)::int from "Lesson" where title like '%${tag}%') lessons`);
  }
})();
