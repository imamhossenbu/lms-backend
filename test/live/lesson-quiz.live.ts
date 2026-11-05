/**
 * API test of course-builder lesson quizzes on /admin/quizzes: create with `lessonId` (module taken from the
 * lesson), list by lessonId, one quiz per lesson, lesson must be in the quiz's course, the quiz follows its lesson to
 * another module, students take it via GET /quiz/lesson/:lessonId without the answers, workspace isolation.
 * API on :4077 by default (LIVE_API_URL). Cleanup in `finally`.
 */
import { check, cleanup, mkCourse, mkInstitution, mkUser, newTag, prisma as p, report, result, type Ids } from "./panel-e2e-helpers";

const API = process.env.LIVE_API_URL ?? "http://localhost:4077";
const tag = newTag();
async function api(token: string | null, method: string, path: string, body?: unknown) {
  const res = await fetch(`${API}${path}`, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: (await res.json().catch(() => null)) as any };
}
const token = async (email: string) => (await api(null, "POST", "/auth/login", { email, password: "Admin12345" })).body?.token as string;

/** What the panel's quizSync sends (see lms-admin-panel …/lesson/quiz/quizSync.ts). */
const payload = (courseId: string, lessonId: string, extra: Record<string, unknown> = {}) => ({
  title: `Lesson Quiz ${tag}`,
  courseId,
  lessonId,
  difficulty: "BEGINNER",
  descriptionHtml: `<p>Quiz for the lesson "${tag}".</p>`,
  instructionsHtml: "",
  questions: [
    { id: "q-1", kind: "MULTIPLE_CHOICE", questionHtml: "<p>2 + 2 = ?</p>", options: [{ id: "a", text: "3" }, { id: "b", text: "4" }], correctOptionIds: ["b"], acceptedAnswers: [], explanationHtml: "", points: 2, timeLimitSeconds: null, required: true, shuffleOptions: false },
    { id: "q-2", kind: "TRUE_FALSE", questionHtml: "<p>Sky is blue</p>", options: [{ id: "a", text: "True" }, { id: "b", text: "False" }], correctOptionIds: ["a"], acceptedAnswers: [], explanationHtml: "", points: 1, timeLimitSeconds: null, required: true, shuffleOptions: false },
  ],
  passingMarks: 2,
  timeLimitMinutes: 10,
  maxAttempts: "UNLIMITED",
  showCorrectAnswers: true,
  showExplanation: true,
  randomizeQuestions: false,
  randomizeOptions: false,
  startDate: "",
  endDate: "",
  access: "ENROLLED",
  requirePreviousLessons: false,
  showImmediately: false,
  status: "PUBLISHED",
  ...extra,
});

(async () => {
  const ids: Ids = { users: [], insts: [] };
  try {
    const inst = await mkInstitution(ids, tag);
    const other = await mkInstitution(ids, `${tag}-other`);
    const admin = await mkUser(ids, tag, "Quiz Admin", "ADMIN", inst.id);
    const student = await mkUser(ids, tag, "Quiz Student", "STUDENT", inst.id);
    const otherAdmin = await mkUser(ids, tag, "Other Admin", "ADMIN", other.id);
    const course = await mkCourse(inst.id, `Quiz Course ${tag}`, admin.id);
    const course2 = await mkCourse(inst.id, `Quiz Course Two ${tag}`, admin.id);
    const modA = await p.courseModule.create({ data: { courseId: course.id, title: "Module A", order: 1 } });
    const modB = await p.courseModule.create({ data: { courseId: course.id, title: "Module B", order: 2 } });
    const mod2 = await p.courseModule.create({ data: { courseId: course2.id, title: "Other Module", order: 1 } });
    const lesson = await p.lesson.create({ data: { courseId: course.id, moduleId: modA.id, title: `Quiz Lesson ${tag}`, type: "QUIZ", durationMinutes: 10, order: 1, status: "PUBLISHED" } });
    const lesson2 = await p.lesson.create({ data: { courseId: course2.id, moduleId: mod2.id, title: `Other Lesson ${tag}`, type: "QUIZ", durationMinutes: 10, order: 1, status: "PUBLISHED" } });
    await p.enrollment.create({ data: { userId: student.id, courseId: course.id, status: "ACTIVE" } });
    const t = await token(admin.email);

    const created = await api(t, "POST", "/admin/quizzes", payload(course.id, lesson.id));
    check("create with lessonId (no moduleId) works", created.status === 201 && created.body?.lessonId === lesson.id && created.body?.moduleId === modA.id, { s: created.status, b: created.body?.message ?? created.body?.moduleId });
    const quizId = created.body?.id;

    const listed = await api(t, "GET", `/admin/quizzes?lessonId=${lesson.id}`);
    check("list filters by lessonId", listed.status === 200 && listed.body?.data?.length === 1 && listed.body.data[0].id === quizId, listed.body?.meta);

    const dup = await api(t, "POST", "/admin/quizzes", payload(course.id, lesson.id));
    check("a second quiz for the same lesson is refused (409)", dup.status === 409, dup);

    const wrong = await api(t, "POST", "/admin/quizzes", payload(course.id, lesson2.id));
    check("a lesson of another course is refused (400)", wrong.status === 400, wrong);

    const noModule = await api(t, "POST", "/admin/quizzes", { ...payload(course.id, ""), lessonId: undefined });
    check("without lessonId the module is still required (400)", noModule.status === 400, noModule.body?.message);

    await p.lesson.update({ where: { id: lesson.id }, data: { moduleId: modB.id } });
    const upd = await api(t, "PATCH", `/admin/quizzes/${quizId}`, { ...payload(course.id, lesson.id), passingMarks: 3 });
    check("update follows the lesson to its new module", upd.status === 200 && upd.body?.moduleId === modB.id && upd.body?.passingMarks === 3, { s: upd.status, m: upd.body?.moduleId });

    const st = await token(student.email);
    const take = await api(st, "GET", `/quiz/lesson/${lesson.id}`);
    const raw = JSON.stringify(take.body ?? {});
    check("student gets the lesson's quiz", take.status === 200 && take.body?.id === quizId, { s: take.status, id: take.body?.id });
    check("student payload has no correct answers", !raw.includes("correctOptionIds") && !raw.includes("acceptedAnswers"), raw.slice(0, 200));

    const draft = await api(t, "PATCH", `/admin/quizzes/${quizId}`, { ...payload(course.id, lesson.id), questions: [], status: "DRAFT" });
    const take2 = await api(st, "GET", `/quiz/lesson/${lesson.id}`);
    check("drafted lesson quiz is no longer served to students", draft.status === 200 && take2.body?.id !== quizId, { d: draft.status, s2: take2.status });

    const ot = await token(otherAdmin.email);
    const iso = await api(ot, "GET", `/admin/quizzes?lessonId=${lesson.id}`);
    check("another workspace doesn't see the lesson quiz", iso.status === 200 && iso.body?.data?.length === 0, iso.body?.data?.length);
  } catch (e) {
    console.log("FAIL exception", (e as Error).message || String(e).slice(0, 400));
    result.bad++;
  } finally {
    await cleanup(ids, tag, async (courses) => {
      await p.quiz.deleteMany({ where: { courseId: { in: courses } } });
    });
    await report(tag, `, (select count(*)::int from "Quiz" where title like '%${tag}%') quizzes`);
  }
})();
