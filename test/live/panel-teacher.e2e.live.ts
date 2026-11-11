/**
 * Browser E2E for the panel's teacher mode (/teach): a TEACHER signs in on the panel login → /teach (admin pages
 * redirect back), dashboard stats + open-question banner, only their own courses / students, grading (marks above
 * the maximum refused, then graded → Graded tab), quiz results, answering a learner's question, profile save;
 * API: another teacher's course / submission → 404, admin endpoints → 403; an admin is kept out of /teach.
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
    const admin = await mkUser(ids, tag, "Teach Admin", "ADMIN", inst.id);
    const teacher = await mkUser(ids, tag, "Rina Teacher", "TEACHER", inst.id);
    const other = await mkUser(ids, tag, "Other Teacher", "TEACHER", inst.id);
    const s1 = await mkUser(ids, tag, "Mine Learner", "STUDENT", inst.id);
    const s2 = await mkUser(ids, tag, "Their Learner", "STUDENT", inst.id);
    const cat = await p.category.create({ data: { name: "Dev", slug: `${tag}-dev`, status: "ACTIVE", institutionId: inst.id } });
    const mk = (title: string, instructorId: string) =>
      p.course.create({ data: { title, slug: title.toLowerCase().replace(/\s+/g, "-"), description: "d", shortDescription: "s", categoryId: cat.id, instructorId, level: "Beginner", language: "English", price: 0, isFree: true, status: "PUBLISHED", durationMinutes: 30, institutionId: inst.id } });
    const mine = await mk(`${tag} Mine Course`, teacher.id);
    const theirs = await mk(`${tag} Their Course`, other.id);
    await p.enrollment.create({ data: { userId: s1.id, courseId: mine.id, status: "ACTIVE", progressPercentage: 40 } });
    await p.enrollment.create({ data: { userId: s2.id, courseId: theirs.id, status: "ACTIVE" } });
    const a1 = await p.assignment.create({ data: { institutionId: inst.id, courseId: mine.id, title: "Build a page", dueDate: new Date(Date.now() + 864e5), marks: 20, allowedFileTypes: "", status: "PUBLISHED", type: "TEXT" } });
    const a2 = await p.assignment.create({ data: { institutionId: inst.id, courseId: theirs.id, title: "Their task", dueDate: new Date(Date.now() + 864e5), marks: 10, allowedFileTypes: "", status: "PUBLISHED", type: "TEXT" } });
    const sub1 = await p.assignmentSubmission.create({ data: { assignmentId: a1.id, userId: s1.id, textAnswer: "My page uses flexbox and grid.", status: "PENDING" } });
    const sub2 = await p.assignmentSubmission.create({ data: { assignmentId: a2.id, userId: s2.id, textAnswer: "Theirs", status: "PENDING" } });
    const quiz = await p.quiz.create({ data: { institutionId: inst.id, courseId: mine.id, title: "Mine quiz", passingScore: 5, totalMarks: 10, status: "PUBLISHED" } });
    await p.quizAttempt.create({ data: { quizId: quiz.id, userId: s1.id, answers: "[]", score: 7, totalMarks: 10, percentage: 70, parsed: true, passed: true, submittedAt: new Date() } });
    const question = await p.discussion.create({ data: { institutionId: inst.id, courseId: mine.id, userId: s1.id, title: "How do I center a div?", body: "<p>Flexbox confuses me.</p>", category: "QUESTION" } });

    // ---------------------------------------------------------------- teacher signs in → /teach
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(`${PANEL}/login`, { waitUntil: "networkidle2" });
    await fill(page, "#email-address", teacher.email);
    await fill(page, "#password-field", "Admin12345");
    await page.click('button[type="submit"]');
    await until(async () => page.url(), (u) => u.endsWith("/teach"), 60);
    const t0 = await waitForText(page, "student question", 60000).then(() => text(page));
    check("teacher signs in on the panel → teacher dashboard", t0.includes("Teacher Panel") && t0.includes("To grade") && t0.includes("1 student question"), page.url());
    await page.screenshot({ path: `${SHOTS}/teach-1-dashboard.png` });
    await page.goto(`${PANEL}/students`, { waitUntil: "networkidle2" });
    await until(async () => page.url(), (u) => u.endsWith("/teach"));
    check("admin pages send a teacher back to /teach", page.url().endsWith("/teach"));

    // ---------------------------------------------------------------- own data only
    await page.goto(`${PANEL}/teach/courses`, { waitUntil: "networkidle2" });
    const t1 = await waitForText(page, mine.title).then(() => text(page));
    check("My Courses: only the teacher's own course", !t1.includes(theirs.title));
    await page.goto(`${PANEL}/teach/students`, { waitUntil: "networkidle2" });
    const t2 = await waitForText(page, "Mine Learner").then(() => text(page));
    check("Students: only learners of own courses", !t2.includes("Their Learner") && t2.includes("40%"));

    // ---------------------------------------------------------------- grading
    await page.goto(`${PANEL}/teach/grading`, { waitUntil: "networkidle2" });
    await waitForText(page, "Build a page");
    check("grading queue shows own submission only", !(await text(page)).includes("Their task"));
    await realClick(page, "button", "Grade", true);
    await page.waitForSelector("#grade-marks");
    await waitForText(page, "My page uses flexbox and grid.");
    await fill(page, "#grade-marks", "25");
    await realClick(page, "button", "Save grade");
    await waitForText(page, "Marks can be at most 20");
    await fill(page, "#grade-marks", "17");
    await page.type("#grade-feedback", "Clean layout — add a mobile view next time.");
    await realClick(page, "button", "Save grade");
    const graded = await until(() => p.assignmentSubmission.findUnique({ where: { id: sub1.id } }), (s: any) => s?.status === "GRADED");
    check("marks above the max refused; 17/20 + feedback saved", graded?.marksObtained === 17 && graded.feedback?.startsWith("Clean layout") && graded.gradedById === teacher.id);
    await page.goto(`${PANEL}/teach/grading?status=GRADED`, { waitUntil: "networkidle2" });
    check("Graded tab lists it (?status survives)", (await waitForText(page, "17/20").then(() => text(page))).includes("Build a page"));
    await page.screenshot({ path: `${SHOTS}/teach-2-grading.png` });

    // ---------------------------------------------------------------- quizzes + Q&A + profile
    await page.goto(`${PANEL}/teach/quizzes`, { waitUntil: "networkidle2" });
    check("quiz results show the attempt", (await waitForText(page, "Mine quiz").then(() => text(page))).includes("70%"));
    await page.goto(`${PANEL}/teach/questions`, { waitUntil: "networkidle2" });
    await waitForText(page, "How do I center a div?");
    await page.type('textarea[aria-label="Your answer"]', "Use display:flex with justify-content and align-items set to center.");
    await realClick(page, "button", "Post answer");
    const reply = await until(() => p.discussionReply.findFirst({ where: { discussionId: question.id, userId: teacher.id } }), (r: any) => !!r);
    check("answer posted to the learner's question (sanitised HTML)", !!reply && reply.body.startsWith("<p>Use display:flex"));
    await page.goto(`${PANEL}/teach/profile`, { waitUntil: "networkidle2" });
    await page.waitForSelector("#t-headline");
    await new Promise((r) => setTimeout(r, 800));
    await fill(page, "#t-headline", "Frontend Mentor");
    await realClick(page, "button", "Save profile");
    const prof = await until(() => p.user.findUnique({ where: { id: teacher.id } }), (u: any) => u?.headline === "Frontend Mentor");
    check("profile headline saved", prof?.headline === "Frontend Mentor");

    // ---------------------------------------------------------------- API isolation
    const tok = await loginApi(teacher.email);
    const h = { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" };
    const r1 = await fetch(`${API}/teacher/courses/${theirs.id}`, { headers: h });
    const r2 = await fetch(`${API}/teacher/submissions/${sub2.id}/grade`, { method: "PATCH", headers: h, body: JSON.stringify({ marks: 5 }) });
    const r3 = await fetch(`${API}/students`, { headers: h });
    const r4 = await fetch(`${API}/teacher/dashboard`, { headers: { Authorization: `Bearer ${await loginApi(s1.email)}` } });
    check("another teacher's course/submission → 404; admin API → 403; students can't use /teacher", r1.status === 404 && r2.status === 404 && r3.status === 403 && r4.status === 403, [r1.status, r2.status, r3.status, r4.status]);

    // ---------------------------------------------------------------- admin is kept out of /teach
    const actx = await browser.createBrowserContext();
    const apage = await actx.newPage();
    await apage.setViewport({ width: 1440, height: 900 });
    await apage.goto(`${PANEL}/login`, { waitUntil: "networkidle2" });
    await fill(apage, "#email-address", admin.email);
    await fill(apage, "#password-field", "Admin12345");
    await apage.click('button[type="submit"]');
    await until(async () => apage.url(), (u) => new URL(u).pathname === "/", 60);
    await apage.goto(`${PANEL}/teach`, { waitUntil: "networkidle2" });
    await until(async () => apage.url(), (u) => new URL(u).pathname === "/");
    check("an admin opening /teach goes back to the admin dashboard", new URL(apage.url()).pathname === "/");
  } catch (err) {
    check("suite crashed", false, (err as Error).stack);
    for (const [i, pg] of (await browser.pages()).entries()) await pg.screenshot({ path: `${SHOTS}/teach-fail-${i}.png` }).catch(() => {});
  } finally {
    await browser.close();
    await cleanup(ids, tag, async (courses) => {
      const threads = (await p.discussion.findMany({ where: { courseId: { in: courses } }, select: { id: true } })).map((d: any) => d.id);
      await retry(() => p.discussionReply.deleteMany({ where: { discussionId: { in: threads } } }));
      await retry(() => p.discussion.deleteMany({ where: { id: { in: threads } } }));
      await retry(() => p.quizAttempt.deleteMany({ where: { quiz: { courseId: { in: courses } } } }));
      await retry(() => p.quiz.deleteMany({ where: { courseId: { in: courses } } }));
      await retry(() => p.assignmentSubmission.deleteMany({ where: { assignment: { courseId: { in: courses } } } }));
      await retry(() => p.assignment.deleteMany({ where: { courseId: { in: courses } } }));
    });
    await report(tag);
  }
})();
