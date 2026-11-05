/**
 * API test of lesson access / drip enforcement for students (rules set the way the panel saves them: PATCH lesson
 * with editorSettings): open lesson, previous-lesson prerequisite (unlocks after completing), draft hidden, drip
 * after enrollment (custom message, can't be completed), private hidden (resources too), country restriction via
 * the CDN header, the lesson's quiz follows the lesson, lesson lists / public course detail show no locked content,
 * staff never gated. API on :4077 by default (LIVE_API_URL). Cleanup in `finally`.
 */
import { check, cleanup, mkCourse, mkInstitution, mkUser, newTag, prisma as p, report, result, type Ids } from "./panel-e2e-helpers";

const API = process.env.LIVE_API_URL ?? "http://localhost:4077";
const tag = newTag();
async function api(token: string | null, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(`${API}${path}`, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: (await res.json().catch(() => null)) as any };
}
const token = async (email: string) => (await api(null, "POST", "/auth/login", { email, password: "Admin12345" })).body?.token as string;

(async () => {
  const ids: Ids = { users: [], insts: [] };
  try {
    const inst = await mkInstitution(ids, tag);
    const admin = await mkUser(ids, tag, "Gate Admin", "ADMIN", inst.id);
    const student = await mkUser(ids, tag, "Gate Student", "STUDENT", inst.id);
    const course = await mkCourse(inst.id, `Gate Course ${tag}`, admin.id);
    const mod = await p.courseModule.create({ data: { courseId: course.id, title: "Module", order: 1 } });
    const mk = (order: number, title: string, status = "PUBLISHED") =>
      p.lesson.create({ data: { courseId: course.id, moduleId: mod.id, title: `${title} ${tag}`, type: "TEXT", content: `<p>Secret ${title}</p>`, videoUrl: "https://example.com/v.mp4", durationMinutes: 5, order, status } });
    const l1 = await mk(1, "Open");
    const l2 = await mk(2, "Needs Previous");
    const l3 = await mk(3, "Draft", "DRAFT");
    const l4 = await mk(4, "Drip");
    const l5 = await mk(5, "Private");
    const l6 = await mk(6, "Geo");
    await p.lessonResource.create({ data: { lessonId: l5.id, title: "Hidden sheet", fileUrl: "https://example.com/s.pdf", fileType: "PDF", size: "1 MB" } });
    await p.enrollment.create({ data: { userId: student.id, courseId: course.id, status: "ACTIVE" } });

    const ta = await token(admin.email);
    const lessonPath = (id: string) => `/courses/${course.id}/modules/${mod.id}/lessons/${id}`;
    const setRules = (id: string, editorSettings: Record<string, unknown>) => api(ta, "PATCH", lessonPath(id), { editorSettings });
    const r2 = await setRules(l2.id, { access: { visibility: "PUBLIC", accessType: "PREVIOUS_LESSON" } });
    await setRules(l4.id, { drip: { releaseType: "AFTER_ENROLLMENT", releaseValue: 1, releaseUnit: "WEEKS", beforeRelease: "SHOW_MESSAGE", lockedMessage: `Unlocks next week ${tag}` } });
    await setRules(l5.id, { access: { visibility: "PRIVATE" } });
    await setRules(l6.id, { access: { geoRestriction: { enabled: true, countries: ["BD"] } } });
    check("admin saves the rules through the lesson API", r2.status === 200, r2.body?.message);

    const ts = await token(student.email);
    const get = (id: string, headers?: Record<string, string>) => api(ts, "GET", lessonPath(id), undefined, headers);

    const g1 = await get(l1.id);
    check("an open lesson works", g1.status === 200 && g1.body?.content?.includes("Secret Open"), g1.status);

    const g2 = await get(l2.id);
    check("previous-lesson rule blocks until it's completed (403)", g2.status === 403 && g2.body?.code === "LESSON_PREREQUISITE", g2.body);
    const done = await api(ts, "POST", `${lessonPath(l1.id)}/complete`);
    const g2b = await get(l2.id);
    check("completing the previous lesson unlocks it", (done.status === 200 || done.status === 201) && g2b.status === 200, { done: done.status, s: g2b.status });

    const g3 = await get(l3.id);
    check("a draft lesson doesn't exist for students (404)", g3.status === 404, g3.status);

    const g4 = await get(l4.id);
    check("drip after enrollment shows the custom message (403)", g4.status === 403 && g4.body?.code === "LESSON_DRIP" && g4.body?.message === `Unlocks next week ${tag}`, g4.body);
    const c4 = await api(ts, "POST", `${lessonPath(l4.id)}/complete`);
    check("a locked lesson can't be completed", c4.status === 403, c4.status);

    const g5 = await get(l5.id);
    const r5 = await api(ts, "GET", `/lessons/${l5.id}/resources`);
    check("a private lesson and its resources are hidden (404)", g5.status === 404 && r5.status === 404, { g: g5.status, r: r5.status });

    const g6us = await get(l6.id, { "cf-ipcountry": "US" });
    const g6bd = await get(l6.id, { "cf-ipcountry": "BD" });
    check("country restriction uses the CDN country header", g6us.status === 403 && g6us.body?.code === "LESSON_COUNTRY" && g6bd.status === 200, { us: g6us.status, bd: g6bd.status });

    // Lesson quiz follows its lesson.
    await p.quiz.create({ data: { institutionId: inst.id, courseId: course.id, moduleId: mod.id, lessonId: l4.id, title: `Gate Quiz ${tag}`, passingScore: 1, totalMarks: 1, status: "PUBLISHED" } });
    const q4 = await api(ts, "GET", `/quiz/lesson/${l4.id}`);
    const qList = await api(ts, "GET", `/quiz/course/${course.id}`);
    check("the quiz of a locked lesson is locked too", q4.status === 403 && Array.isArray(qList.body) && qList.body.length === 0, { q: q4.status, list: qList.body?.length });

    const list = await api(ts, "GET", `/courses/${course.id}/modules/${mod.id}/lessons`);
    const pub = await api(null, "GET", `/courses/${course.id}?institution=${inst.slug}`);
    const pubLessons = (pub.body?.modules ?? []).flatMap((m: any) => m.lessons ?? []);
    const leaks = (rows: any[]) => rows.some((l) => (l.content ?? "").includes("Secret") || l.videoUrl);
    check("lesson lists and the public course detail show no lesson content", list.status === 200 && list.body.length === 6 && !leaks(list.body) && pub.status === 200 && pubLessons.length === 6 && !leaks(pubLessons), { l: list.status, p: pub.status });

    const staff = await Promise.all([l3, l4, l5].map((l) => api(ta, "GET", lessonPath(l.id))));
    const staffList = await api(ta, "GET", `/courses/${course.id}/modules/${mod.id}/lessons`);
    check("staff are never gated", staff.every((r) => r.status === 200) && staffList.body?.[0]?.content?.includes("Secret"), staff.map((r) => r.status));
  } catch (e) {
    console.log("FAIL exception", (e as Error).message || String(e).slice(0, 400));
    result.bad++;
  } finally {
    await cleanup(ids, tag, async (courses) => {
      await p.quiz.deleteMany({ where: { courseId: { in: courses } } });
    });
    await report(tag, `, (select count(*)::int from "Lesson" where title like '%${tag}%') lessons`);
  }
})();
