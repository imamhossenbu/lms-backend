/**
 * Full CRUD regression across EVERY domain (create → read → list → update → delete) in an isolated "pro"
 * workspace: SaaS (owner / me / console extras), catalogue, students, instructors, team + 2FA, admin orders,
 * assignments, quizzes, live classes, certificates, community, notifications, settings, analytics,
 * student-facing flows, coupons and auth. Server on :4077. Everything is removed in `finally`.
 */
import "dotenv/config";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { createHash } from "crypto";
import { authenticator } from "otplib";
import { PrismaService } from "../../src/prisma/prisma.service";

const BASE = process.env.LIVE_API_URL ?? "http://localhost:4077";
const p: any = new PrismaService();
const jwt = new JwtService({ secret: process.env.SUPER_SECRET_KEY });
const tag = `all-test-${Date.now()}`;
const results: Record<string, { ok: number; bad: number }> = {};
let section = "setup";
const check = (name: string, cond: boolean, extra?: unknown) => {
  results[section] ??= { ok: 0, bad: 0 };
  cond ? results[section].ok++ : results[section].bad++;
  if (!cond) console.log("FAIL", `[${section}]`, name, JSON.stringify(extra)?.slice(0, 400));
};
const call = async (token: string | null, method: string, path: string, body?: unknown) => {
  const r = await fetch(BASE + path, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: r.status, body: json };
};
const ok = (r: { status: number }) => r.status >= 200 && r.status < 300;
const tok = (u: any) => jwt.sign({ sub: u.id, email: u.email, role: u.role, institutionId: u.institutionId }, { expiresIn: "30m" });
const day = (offset: number) => new Date(Date.now() + offset * 864e5 + 6 * 3600e3).toISOString().slice(0, 10);

(async () => {
  const ids: any = { institutions: [] as string[], users: [] as string[], plans: [] as string[], saasCoupons: [] as string[] };
  try {
    const SA = jwt.sign({ sub: "00000000-0000-0000-0000-000000000000", email: "owner@x", role: "SUPER_ADMIN" }, { expiresIn: "30m" });

    // ================================================================ SaaS (owner, me, console extras)
    section = "saas";
    let r = await call(null, "GET", "/saas/public/plans");
    check("public plans", ok(r) && r.body.length >= 3, r.body);
    const planBody = { name: `Zz ${Date.now() % 100000}`, tagline: "Test plan tagline", priceMonthly: 49, priceYearly: 490, limits: { students: 500, courses: 50, teamMembers: 5, storageGb: 20 }, features: ["community"], highlighted: false, isPublic: true, trialDays: 14 };
    r = await call(SA, "POST", "/saas/owner/plans", planBody);
    check("create plan", r.status === 201, r.body);
    ids.plans.push(r.body.id);
    r = await call(SA, "PUT", `/saas/owner/plans/${r.body.id}`, { ...planBody, priceMonthly: 59, priceYearly: 590 });
    check("update plan", ok(r) && r.body.priceMonthly === 59, r.body);
    r = await call(SA, "PATCH", `/saas/owner/plans/${ids.plans[0]}/archive`, { archived: true });
    check("archive plan", ok(r) && r.body.archived, r.body);
    const instBody = (n: string, plan: string, trial: boolean) => ({ name: `Zz All ${n}`, type: "SCHOOL", country: "Bangladesh", ownerName: "Zz", ownerEmail: `${tag}-inst-${n}@example.com`, phone: "", slug: `${tag}-${n}`.slice(0, 32).replace(/-+$/, ""), planId: plan, cycle: "MONTHLY", startWithTrial: trial, trialDays: 14, notes: "" });
    r = await call(SA, "POST", "/saas/owner/institutions", instBody("a", "pro", false));
    check("create institution (Pro)", r.status === 201, r.body);
    const A = r.body; ids.institutions.push(A.id);
    r = await call(SA, "POST", "/saas/owner/institutions", instBody("b", "growth", true));
    const Bi = r.body; ids.institutions.push(Bi.id);
    r = await call(SA, "GET", `/saas/owner/institutions/${A.id}`);
    check("institution detail", ok(r) && r.body.invoices.length === 1, r.body);
    r = await call(SA, "PATCH", `/saas/owner/institutions/${A.id}`, { notes: "VIP" });
    check("update institution", ok(r), r.body);
    r = await call(SA, "PATCH", `/saas/owner/institutions/${A.id}/payment-method`, { brand: "Visa", last4: "4242" });
    r = await call(SA, "POST", `/saas/owner/invoices/${(await call(SA, "GET", `/saas/owner/invoices?institutionId=${A.id}`)).body[0].id}/retry`);
    check("retry invoice", ok(r) && r.body.status === "PAID", r.body);
    r = await call(SA, "POST", `/saas/owner/institutions/${A.id}/domain`, { domain: `learn.${tag}.example` });
    check("add domain", r.status === 201, r.body);
    r = await call(SA, "DELETE", `/saas/owner/institutions/${A.id}/domain`);
    check("remove domain", ok(r), r.body);
    r = await call(SA, "GET", "/saas/owner/snapshot");
    check("snapshot", ok(r) && Array.isArray(r.body.institutions), typeof r.body);
    r = await call(SA, "POST", "/saas/owner/coupons", { code: `ZZ${Date.now() % 100000}`, description: "", type: "PERCENT", value: 10, duration: "ONCE", durationMonths: 3, planIds: [], cycle: "ANY", limitRedemptions: true, maxRedemptions: 5, hasExpiry: false, expiresOn: "", newCustomersOnly: false, active: true });
    check("console coupon create", r.status === 201, r.body);
    const sc = r.body; if (sc?.id) ids.saasCoupons.push(sc.id);
    r = await call(SA, "GET", "/saas/owner/coupons");
    check("console coupon list", ok(r), r.body);
    r = await call(SA, "PATCH", `/saas/owner/coupons/${sc.id}/active`, { active: false });
    check("console coupon deactivate", ok(r), r.body);
    r = await call(SA, "DELETE", `/saas/owner/coupons/${sc.id}`);
    check("console coupon delete", ok(r), r.body);
    r = await call(SA, "GET", "/saas/owner/alerts");
    check("console alerts", ok(r), r.body);
    r = await call(SA, "GET", "/saas/owner/console-settings");
    check("console settings", ok(r), r.body);

    const mkUser = async (n: string, role: string, institutionId: string, password = "x") => {
      const u = await p.user.create({ data: { name: `Zz ${n}`, email: `${tag}-${n}@example.com`, password, role, status: "ACTIVE", emailVerified: true, institutionId } });
      ids.users.push(u.id);
      return u;
    };
    const adminA = await mkUser("admin-a", "ADMIN", A.id), adminB = await mkUser("admin-b", "ADMIN", Bi.id);
    const TA = tok(adminA), TB = tok(adminB);
    r = await call(TA, "GET", "/saas/me");
    check("GET /saas/me", ok(r) && r.body.institution.id === A.id, r.body);

    // ================================================================ catalogue
    section = "catalog";
    r = await call(TA, "POST", "/categories", { name: "Zz Cat", slug: `${tag}-cat`, description: "test" });
    check("create category", r.status === 201, r.body);
    const cat = r.body;
    r = await call(TA, "GET", "/categories");
    check("list categories", ok(r) && JSON.stringify(r.body).includes(cat.id), r.body);
    r = await call(TA, "PATCH", `/categories/${cat.id}`, { name: "Zz Cat 2", status: "ACTIVE" });
    check("update category", ok(r), r.body);
    const courseBody = (n: string, price: number) => ({ title: `Zz Course ${n}`, slug: `${tag}-${n}`, description: "Long description", shortDescription: "Short", categoryId: cat.id, level: "BEGINNER", language: "English", price, isFree: price === 0, durationMinutes: 90, status: "PUBLISHED" });
    r = await call(TA, "POST", "/courses", courseBody("paid", 1500));
    check("create course", r.status === 201, r.body);
    const course = r.body;
    r = await call(TA, "POST", "/courses", courseBody("free", 0));
    const freeCourse = r.body;
    r = await call(TA, "GET", "/courses?limit=50");
    check("list courses", ok(r) && JSON.stringify(r.body).includes(course.id), r.status);
    r = await call(TA, "PATCH", `/courses/${course.id}`, { shortDescription: "Updated" });
    check("update course", ok(r), r.body);
    r = await call(TA, "POST", `/courses/${course.id}/modules`, { title: "Module 1", order: 1 });
    check("create module", r.status === 201, r.body);
    const mod = r.body;
    r = await call(TA, "PATCH", `/courses/${course.id}/modules/${mod.id}`, { title: "Module One" });
    check("update module", ok(r), r.body);
    r = await call(TA, "POST", `/courses/${course.id}/modules/${mod.id}/lessons`, { title: "Lesson 1", type: "TEXT", content: "<p>Hi</p>", durationMinutes: 10, order: 1, status: "PUBLISHED" });
    check("create lesson", r.status === 201, r.body);
    const lesson = r.body;
    r = await call(TA, "GET", `/courses/${course.id}/modules/${mod.id}/lessons/${lesson.id}`);
    check("get lesson", ok(r), r.body);
    r = await call(TA, "PATCH", `/courses/${course.id}/modules/${mod.id}/lessons/${lesson.id}`, { title: "Lesson One" });
    check("update lesson", ok(r), r.body);
    // Creating a resource needs a real multipart file upload (Cloudinary), so only the read path is checked here.
    r = await call(TA, "GET", `/lessons/${lesson.id}/resources`);
    check("list lesson resources", ok(r) && Array.isArray(r.body), r.body);
    r = await call(TA, "POST", `/lessons/${lesson.id}/resources`, { title: "Slides", fileType: "PDF", size: "1MB" });
    check("create resource without a file → 400", r.status === 400, r.body);

    // ================================================================ students / instructors
    section = "students";
    r = await call(TA, "POST", "/students", { name: "Zz Student", email: `${tag}-s1@example.com`, status: "Active", enrolledCourseIds: [course.id] });
    check("create student", r.status === 201, r.body);
    const s1 = r.body; ids.users.push(s1.id);
    r = await call(TA, "GET", "/students?q=Zz%20Student");
    check("list students", ok(r) && r.body.meta.total === 1, r.body);
    r = await call(TA, "PATCH", `/students/${s1.id}`, { name: "Zz Student Uno" });
    check("update student", ok(r), r.body);
    for (const tab of ["courses", "quizzes", "assignments", "certificates", "activity"]) check(`student tab ${tab}`, ok(await call(TA, "GET", `/students/${s1.id}/${tab}`)), tab);
    r = await call(TA, "POST", `/students/${s1.id}/notes`, { category: "general", content: "First note" });
    r = await call(TA, "DELETE", `/students/${s1.id}/notes/${r.body.id}`);
    check("student note create + delete", ok(r), r.body);
    section = "instructors";
    r = await call(TA, "POST", "/instructors", { name: "Zz Teacher", email: `${tag}-t1@example.com`, status: "Active" });
    check("create instructor", r.status === 201, r.body);
    const t1 = r.body; ids.users.push(t1.id);
    r = await call(TA, "PATCH", `/instructors/${t1.id}`, { title: "Senior Dev" });
    check("update instructor", ok(r), r.body);
    for (const tab of ["courses", "students", "reviews", "schedule", "activity", "notes"]) check(`instructor tab ${tab}`, ok(await call(TA, "GET", `/instructors/${t1.id}/${tab}`)), tab);

    // ================================================================ assignments
    section = "assignments";
    const lvl = (id: string, tone: string, points: number) => ({ id, tone, label: tone === "EXCELLENT" ? "Excellent" : "Good", points, description: "Level text" });
    const asg = {
      courseId: course.id, title: "Build a landing page", descriptionHtml: "<p>Build a responsive landing page.</p>", moduleId: mod.id, lessonId: "", type: "FILE_UPLOAD", dueDate: day(10), dueTime: "23:59", totalPoints: 30, attempts: "UNLIMITED", lateSubmission: "ALLOW", gradingType: "POINTS", showRubric: true, peerReview: false, attachments: [],
      instructions: { overview: "", objectives: [], tasks: [], requirements: [], allowedFileTypes: [".zip", ".pdf"], maxFileSizeMb: 50, gradingNotes: [] },
      rubric: { enabled: true, title: "Rubric", totalPoints: 30, description: "", visibleToStudents: true, criteria: [{ id: "c1", title: "Layout", description: "Layout works", points: 20, levels: [lvl("c1-ex", "EXCELLENT", 20), lvl("c1-gd", "GOOD", 12)] }, { id: "c2", title: "Code", description: "Clean code", points: 10, levels: [lvl("c2-ex", "EXCELLENT", 10), lvl("c2-gd", "GOOD", 6)] }] },
      category: "Project", difficulty: "BEGINNER", estimatedTime: 2, estimatedUnit: "HOURS", instructionsHtml: "<p>Follow the design file and ship a working page.</p>", maxFiles: 1, latePenalty: 0, latePenaltyUnit: "PERCENT", passingScore: 18, gradeDisplay: "EXACT", aiGrading: { enabled: false, criteria: "" }, manualOverride: true, releaseDate: day(0), releaseTime: "00:00", availability: "UNTIL_DUE", timeLimitMinutes: 60, windowStartDate: "", windowStartTime: "", windowEndDate: "", windowEndTime: "", showInCalendar: true, status: "PUBLISHED",
    };
    r = await call(TA, "POST", "/admin/assignments", asg);
    check("create assignment", r.status === 201, r.body);
    const a1 = r.body;
    r = await call(TA, "GET", "/admin/assignments");
    check("list assignments", ok(r) && JSON.stringify(r.body).includes(a1.id), r.status);
    r = await call(TA, "GET", `/admin/assignments/${a1.id}`);
    check("get assignment", ok(r), r.body);
    r = await call(TA, "PATCH", `/admin/assignments/${a1.id}`, { title: "Build a landing page v2" });
    check("update assignment", ok(r), r.body);
    for (const sub of ["stats"]) check(`assignments ${sub}`, ok(await call(TA, "GET", `/admin/assignments/${sub}`)), sub);
    for (const sub of ["submissions", "insights"]) check(`assignment ${sub}`, ok(await call(TA, "GET", `/admin/assignments/${a1.id}/${sub}`)), sub);
    r = await call(TA, "POST", `/admin/assignments/${a1.id}/duplicate`);
    check("duplicate assignment", r.status === 201, r.body);
    r = await call(TA, "DELETE", `/admin/assignments/${r.body.id}`);
    check("delete assignment", ok(r), r.body);

    // ================================================================ quizzes
    section = "quizzes";
    const q1 = { id: "q-a", kind: "MULTIPLE_CHOICE", questionHtml: "<p>What is useState for?</p>", options: [{ id: "o1", text: "State" }, { id: "o2", text: "Routing" }], correctOptionIds: ["o1"], acceptedAnswers: [], explanationHtml: "", points: 5, timeLimitSeconds: null, required: true, shuffleOptions: false };
    const quiz = { title: "React basics", courseId: course.id, moduleId: mod.id, difficulty: "BEGINNER", descriptionHtml: "<p>Check your React knowledge.</p>", instructionsHtml: "", questions: [q1], passingMarks: 3, timeLimitMinutes: 10, maxAttempts: "2", showCorrectAnswers: true, showExplanation: true, randomizeQuestions: false, randomizeOptions: false, startDate: "", endDate: "", access: "ENROLLED", requirePreviousLessons: false, showImmediately: true };
    r = await call(TA, "POST", "/admin/quizzes", quiz);
    check("create quiz", r.status === 201, r.body);
    const qz = r.body;
    r = await call(TA, "PATCH", `/admin/quizzes/${qz.id}`, { title: "React basics v2" });
    check("update quiz", ok(r), r.body);
    for (const sub of ["", "/activity", "/attempts", "/insights"]) check(`quiz get${sub}`, ok(await call(TA, "GET", `/admin/quizzes/${qz.id}${sub}`)), sub);
    check("quiz stats + list", ok(await call(TA, "GET", "/admin/quizzes/stats")) && ok(await call(TA, "GET", "/admin/quizzes")), "");
    r = await call(TA, "POST", `/admin/quizzes/${qz.id}/duplicate`);
    check("duplicate quiz", r.status === 201, r.body);
    r = await call(TA, "DELETE", `/admin/quizzes/${r.body.id}`);
    check("delete quiz", ok(r), r.body);

    // ================================================================ live classes
    section = "live-classes";
    const teacherRow = await p.user.findUnique({ where: { id: t1.id } });
    const live = { title: "React Q&A", descriptionHtml: "<p>Bring your questions.</p>", courseId: course.id, instructorId: teacherRow.id, type: "QA", date: day(3), startTime: "10:00", endTime: "11:30", platform: "ZOOM", meetingLink: "https://us02web.zoom.us/j/123", meetingId: "123", passcode: "x", sendLinkToStudents: true, capacity: 50, settings: { allowQa: true, enableChat: true, recordClass: false, makePublic: false, sendReminder: true, autoAttendance: true }, reminder: "15", thumbnailUrl: "" };
    r = await call(TA, "POST", "/admin/live-classes", live);
    check("create live class", r.status === 201, r.body);
    const lc = r.body;
    r = await call(TA, "PATCH", `/admin/live-classes/${lc.id}`, { title: "React Q&A v2" });
    check("update live class", ok(r), r.body);
    for (const sub of ["", "/activity", "/attendance", "/insights", "/questions", "/resources"]) check(`live get${sub}`, ok(await call(TA, "GET", `/admin/live-classes/${lc.id}${sub}`)), sub);
    r = await call(TA, "POST", `/admin/live-classes/${lc.id}/resources`, { type: "DOCUMENT", title: "Slides", description: "", url: "https://example.com/s.pdf", size: 1000, visibility: "ATTENDEES" });
    check("add live resource", r.status === 201, r.body);
    r = await call(TA, "POST", `/admin/live-classes/${lc.id}/cancel`, { reason: "Instructor unavailable", notifyStudents: false });
    check("cancel live class", ok(r), r.body);
    r = await call(TA, "POST", `/admin/live-classes/${lc.id}/restore`);
    check("restore live class", ok(r), r.body);
    r = await call(TA, "POST", `/admin/live-classes/${lc.id}/duplicate`);
    check("duplicate live class", r.status === 201, r.body);
    r = await call(TA, "DELETE", `/admin/live-classes/${r.body.id}`);
    check("delete live class", ok(r), r.body);
    check("live stats", ok(await call(TA, "GET", "/admin/live-classes/stats")), "");

    // ================================================================ certificates
    section = "certificates";
    const tpl = { name: "Classic Completion", layout: "CLASSIC", orientation: "LANDSCAPE", accent: "orange", heading: "Certificate of Completion", bodyText: "This is to certify that {student_name} has successfully completed {course_title} on {completion_date}.", showLogo: true, showQr: true, showGrade: false, signers: [{ id: "signer-1", name: "Arif Hossain", title: "Lead Instructor", signatureUrl: "" }], courseIds: [course.id], rules: { autoIssue: false, minCompletion: 100, minQuizScore: 60, requireAssignments: true, validityMonths: null }, status: "ACTIVE" };
    r = await call(TA, "POST", "/admin/certificates/templates", tpl);
    check("create template", r.status === 201, r.body);
    const tp = r.body;
    r = await call(TA, "PATCH", `/admin/certificates/templates/${tp.id}`, { name: "Classic Completion v2" });
    check("update template", ok(r), r.body);
    check("get/list templates", ok(await call(TA, "GET", `/admin/certificates/templates/${tp.id}`)) && ok(await call(TA, "GET", "/admin/certificates/templates")), "");
    r = await call(TA, "POST", "/admin/certificates/issue", { courseId: course.id, recipientId: s1.id, completedAt: day(0), grade: null, sendEmail: false, note: "" });
    check("issue certificate", ok(r), r.body);
    const certs = (await call(TA, "GET", "/admin/certificates")).body;
    const cert = (certs.data ?? certs)[0];
    check("list certificates", !!cert?.id, certs);
    r = await call(TA, "POST", `/admin/certificates/${cert.id}/revoke`, { reason: "ISSUED_IN_ERROR", details: "", notifyLearner: false });
    check("revoke certificate", ok(r), r.body);
    r = await call(TA, "POST", `/admin/certificates/${cert.id}/restore`);
    check("restore certificate", ok(r), r.body);
    for (const sub of ["stats", "activity", "eligible", "learners"]) check(`certificates ${sub}`, ok(await call(TA, "GET", `/admin/certificates/${sub}`)), sub);

    // ================================================================ community
    section = "community";
    r = await call(TA, "POST", "/admin/community/threads", { title: "How does useEffect cleanup work?", category: "QUESTION", courseId: course.id, moduleId: mod.id, bodyHtml: "<p>I don't understand when cleanup runs.</p>", tags: ["react"], isPinned: false, isLocked: false });
    check("create thread", r.status === 201, r.body);
    const th = r.body;
    r = await call(TA, "PATCH", `/admin/community/threads/${th.id}`, { title: "When does useEffect cleanup run?" });
    check("update thread", ok(r), r.body);
    r = await call(TA, "POST", `/admin/community/threads/${th.id}/replies`, { bodyHtml: "<p>It runs before the next effect and on unmount.</p>" });
    check("reply", r.status === 201, r.body);
    check("thread get + list + stats", ok(await call(TA, "GET", `/admin/community/threads/${th.id}`)) && ok(await call(TA, "GET", "/admin/community/threads")) && ok(await call(TA, "GET", "/admin/community/stats")), "");
    r = await call(TA, "DELETE", `/admin/community/threads/${th.id}`);
    check("delete thread", ok(r), r.body);

    // ================================================================ notifications
    section = "notifications";
    r = await call(TA, "POST", "/admin/notifications/broadcasts", { title: "Exam week", messageHtml: "<p>Exams start on Monday.</p>", audience: "ALL_STUDENTS", channels: ["IN_APP"], asDraft: true });
    check("create broadcast (draft)", r.status === 201, r.body);
    const bc = r.body;
    r = await call(TA, "PATCH", `/admin/notifications/broadcasts/${bc.id}`, { title: "Exam week!", messageHtml: "<p>Exams start on Monday.</p>", audience: "ALL_STUDENTS", channels: ["IN_APP"], asDraft: true });
    check("update broadcast", ok(r), r.body);
    check("broadcast get + list + overview", ok(await call(TA, "GET", `/admin/notifications/broadcasts/${bc.id}`)) && ok(await call(TA, "GET", "/admin/notifications/broadcasts")) && ok(await call(TA, "GET", "/admin/notifications/broadcasts/overview")), "");
    r = await call(TA, "DELETE", `/admin/notifications/broadcasts/${bc.id}`);
    check("delete broadcast", ok(r), r.body);
    r = await call(TA, "GET", "/admin/notifications/templates");
    check("list templates", ok(r), r.body);
    const tplList = r.body.data ?? r.body;
    if (Array.isArray(tplList) && tplList[0]) {
      r = await call(TA, "PATCH", `/admin/notifications/templates/${tplList[0].id}/enabled`, { enabled: tplList[0].enabled !== false ? false : true });
      check("toggle template", ok(r), r.body);
    }
    for (const path of ["/admin/notifications/inbox", "/admin/notifications/inbox/unread-count", "/admin/notifications/stats"]) check(`GET ${path}`, ok(await call(TA, "GET", path)), path);

    // ================================================================ settings + analytics
    section = "settings";
    r = await call(TA, "GET", "/admin/settings");
    check("get settings", ok(r), r.body);
    const general = r.body.settings?.general ?? r.body.general;
    r = await call(TA, "PATCH", "/admin/settings/general", { ...general, platformName: "Zz Academy" });
    check("update general settings", ok(r), r.body);
    r = await call(null, "GET", `/settings/public?institution=${A.slug}`);
    check("public settings", ok(r) && r.body.platformName === "Zz Academy", r.body);
    section = "analytics";
    for (const sub of ["dashboard", "overview", "revenue", "students", "courses", "engagement"]) check(`analytics ${sub}`, ok(await call(TA, "GET", `/admin/analytics/${sub}`)), sub);

    // ================================================================ team + 2FA
    section = "team";
    r = await call(TA, "GET", "/team");
    check("team snapshot", ok(r) && r.body.roles.length >= 5, r.body);
    const roles = r.body.roles;
    const empty = Object.fromEntries(Object.keys(roles[0].permissions).map((k) => [k, []]));
    r = await call(TA, "POST", "/team/roles", { name: "Zz Role", description: "", tone: "red", permissions: { ...empty, dashboard: ["view"] } });
    check("create role", r.status === 201, r.body);
    const roleId = r.body.id;
    r = await call(TA, "POST", "/team/invitations", { emails: [`${tag}-inv@example.com`], roleId: roles.find((x: any) => x.name === "Support").id, message: "hi" });
    check("invite", r.status === 201, r.body);
    const inv = r.body[0].id;
    const token = `known-${tag}-token-abcdefghijkl`;
    await p.teamMember.update({ where: { id: inv }, data: { inviteTokenHash: createHash("sha256").update(token).digest("hex") } });
    r = await call(null, "POST", "/team/invitations/accept", { token, name: "Zz Member", password: "Member1234" });
    check("accept invite", ok(r), r.body);
    const memberUser = await p.user.findFirst({ where: { email: `${tag}-inv@example.com` } }); ids.users.push(memberUser.id);
    r = await call(TA, "PATCH", `/team/members/${inv}`, { roleId });
    check("change member role", ok(r), r.body);
    const TM = tok(memberUser);
    r = await call(TM, "POST", "/auth/2fa/setup");
    r = await call(TM, "POST", "/auth/2fa/enable", { code: authenticator.generate(r.body.secret) });
    check("2fa enable", ok(r), r.body);
    r = await call(TA, "POST", `/team/members/${inv}/reset-2fa`);
    check("reset 2fa", ok(r), r.body);
    r = await call(TA, "DELETE", `/team/members/${inv}`);
    check("remove member", ok(r), r.body);
    r = await call(TA, "DELETE", `/team/roles/${roleId}`);
    check("delete role", ok(r), r.body);

    // ================================================================ admin orders
    section = "orders";
    r = await call(TA, "POST", "/admin/orders", { studentId: s1.id, courseId: freeCourse.id, method: "bKash", markAsPaid: false });
    check("create order", r.status === 201, r.body);
    const o1 = r.body.id;
    r = await call(TA, "POST", `/admin/orders/${o1}/status`, { target: "Paid", method: "bKash", reference: "BK-12345", paidOn: day(0) });
    check("mark paid", ok(r) && r.body.status === "Paid", r.body);
    check("orders list + stats + detail", ok(await call(TA, "GET", "/admin/orders")) && ok(await call(TA, "GET", "/admin/orders/stats")) && ok(await call(TA, "GET", `/admin/payments/${o1}`)), "");
    r = await call(TA, "POST", `/admin/payments/${o1}/status`, { target: "Refunded", reason: "Requested by student" });
    check("refund", ok(r) && r.body.status === "Refunded", r.body);

    // ================================================================ student-facing flows
    section = "student-flows";
    await p.user.update({ where: { id: s1.id }, data: { password: await bcrypt.hash("Student123", 10) } });
    r = await call(null, "POST", "/auth/login", { email: `${tag}-s1@example.com`, password: "Student123" });
    check("student login", ok(r) && r.body.token, r.body);
    const TS = r.body.token;
    check("user me", ok(await call(TS, "GET", "/user/me")), "");
    check("update profile", ok(await call(TS, "PATCH", "/user/profile", { bio: "Learner" })), "");
    check("my courses", ok(await call(TS, "GET", "/enrollments/my-courses")), "");
    check("free enroll", ok(await call(TS, "POST", `/enrollments/free/${freeCourse.id}`)), "");
    check("progress video + complete", ok(await call(TS, "PATCH", `/progress/${lesson.id}/video`, { minutes: 3 })) && ok(await call(TS, "PATCH", `/progress/${lesson.id}/complete`)), "");
    check("course progress", ok(await call(TS, "GET", `/progress/course/${course.id}`)), "");
    check("student: course assignments / quizzes / live classes", ok(await call(TS, "GET", `/assignment/course/${course.id}`)) && ok(await call(TS, "GET", `/quiz/course/${course.id}`)) && ok(await call(TS, "GET", `/live-class/course/${course.id}`)), "");
    check("student: discussions", ok(await call(TS, "GET", `/discussion/course/${course.id}`)), "");
    r = await call(TS, "POST", "/review", { courseId: course.id, rating: 5, reviewText: "Great course" });
    check("create review", r.status === 201, r.body);
    check("update + delete review", ok(await call(TS, "PATCH", `/review/${r.body.id}`, { rating: 4 })) && ok(await call(TS, "DELETE", `/review/${r.body.id}`)), "");
    for (const path of ["/notification", "/notification/unread-count", "/orders/my-orders", "/invoice/my-invoices", "/certificate/my"]) check(`GET ${path}`, ok(await call(TS, "GET", path)), path);
    check("student blocked from admin", (await call(TS, "GET", "/admin/orders")).status === 403, "");

    // ================================================================ coupons + auth
    section = "coupons";
    const now = Date.now();
    r = await call(TA, "POST", "/coupon", { code: `ZZ${now % 1000000}`, discountType: "PERCENTAGE", discountTypeValue: 10, courseId: course.id, maxUses: 5, startDate: new Date(now - 864e5).toISOString(), endDate: new Date(now + 864e5).toISOString(), status: "ACTIVE" });
    check("create coupon", r.status === 201, r.body);
    const cp = r.body;
    check("get/list/update/validate coupon", ok(await call(TA, "GET", `/coupon/${cp.id}`)) && ok(await call(TA, "GET", "/coupon")) && ok(await call(TA, "PATCH", `/coupon/${cp.id}`, { maxUses: 10 })) && ok(await call(null, "GET", `/coupon/validate/${cp.code}/${course.id}`)), "");
    check("delete coupon", ok(await call(TA, "DELETE", `/coupon/${cp.id}`)), "");
    section = "auth";
    const email = `${tag}-reg@example.com`;
    r = await call(null, "POST", "/auth/register", { name: "Zz Reg", email, password: "Register123" });
    check("register", ok(r), r.body);
    const reg = await p.user.findFirst({ where: { email } }); if (reg) ids.users.push(reg.id);
    r = await call(null, "POST", "/auth/verify-email", { email, code: reg?.verificationToken, token: reg?.verificationToken });
    check("verify email", ok(r), r.body);
    r = await call(null, "POST", "/auth/login", { email, password: "Register123" });
    check("login", ok(r) && r.body.token, r.body);
    check("change password", ok(await call(r.body.token, "POST", "/auth/change-password", { currentPassword: "Register123", newPassword: "Register456" })), "");
    check("wrong password 401", (await call(null, "POST", "/auth/login", { email, password: "nope-nope" })).status === 401, "");

    // ================================================================ tenancy spot checks + catalogue delete
    section = "isolation";
    check("B can't read A's course", (await call(TB, "GET", `/courses/${course.id}`)).status === 404, "");
    check("B can't read A's student", (await call(TB, "GET", `/students/${s1.id}`)).status === 404, "");
    check("B can't read A's assignment", (await call(TB, "GET", `/admin/assignments/${a1.id}`)).status === 404, "");
    check("B can't read A's quiz", (await call(TB, "GET", `/admin/quizzes/${qz.id}`)).status === 404, "");
    check("B can't read A's live class", (await call(TB, "GET", `/admin/live-classes/${lc.id}`)).status === 404, "");
    section = "catalog";
    r = await call(TA, "DELETE", `/courses/${freeCourse.id}`);
    check("delete course with orders → 409", r.status === 409, r.body);
  } catch (e) {
    console.log("FAIL exception", e);
    results[section] ??= { ok: 0, bad: 0 };
    results[section].bad++;
  } finally {
    const insts = ids.institutions;
    const users = (await p.user.findMany({ where: { OR: [{ id: { in: ids.users } }, { institutionId: { in: insts } }, { email: { startsWith: tag } }] }, select: { id: true } })).map((u: any) => u.id);
    const courses = (await p.course.findMany({ where: { OR: [{ institutionId: { in: insts } }, { slug: { startsWith: tag } }] }, select: { id: true } })).map((c: any) => c.id);
    const inC = { courseId: { in: courses } };
    const safe = async (fn: () => Promise<unknown>) => fn().catch((e: any) => console.log("cleanup:", e?.message?.slice(0, 120)));
    await safe(() => p.discussionReport.deleteMany({ where: { reporterId: { in: users } } }));
    await safe(() => p.discussion.deleteMany({ where: { OR: [inC, { institutionId: { in: insts } }] } }));
    await safe(() => p.certificate.deleteMany({ where: { OR: [inC, { userId: { in: users } }] } }));
    await safe(() => p.certificateTemplate.deleteMany({ where: { institutionId: { in: insts } } }));
    await safe(() => p.announcement.deleteMany({ where: { institutionId: { in: insts } } }));
    await safe(() => p.notification.deleteMany({ where: { userId: { in: users } } }));
    await safe(() => p.notificationTemplate.deleteMany({ where: { institutionId: { in: insts } } }));
    await safe(() => p.workspaceSettings.deleteMany({ where: { institutionId: { in: insts } } }));
    await safe(() => p.courseReview.deleteMany({ where: { OR: [inC, { userId: { in: users } }] } }));
    await safe(() => p.order.deleteMany({ where: { OR: [inC, { userId: { in: users } }] } }));
    await safe(() => p.coupon.deleteMany({ where: { OR: [inC, { institutionId: { in: insts } }] } }));
    await safe(() => p.course.deleteMany({ where: { id: { in: courses } } }));
    await safe(() => p.category.deleteMany({ where: { institutionId: { in: insts } } }));
    for (const t of ["teamEvent", "teamMember", "teamRole"]) await safe(() => p[t].deleteMany({ where: { institutionId: { in: insts } } }));
    await safe(() => p.activityLog.deleteMany({ where: { userId: { in: users } } }));
    await safe(() => p.user.deleteMany({ where: { id: { in: users } } }));
    await safe(() => p.institution.deleteMany({ where: { id: { in: insts } } }));
    await safe(() => p.saasPlan.deleteMany({ where: { id: { in: ids.plans } } }));
    await safe(() => p.saasCoupon.deleteMany({ where: { id: { in: ids.saasCoupons } } }));
    const left = await p.$queryRawUnsafe(`select (select count(*)::int from "User" where email like '${tag}%') users, (select count(*)::int from institutions where slug like '${tag.slice(0, 20)}%') insts, (select count(*)::int from "Course" where slug like '${tag}%') courses`);
    let ok2 = 0, bad2 = 0;
    for (const [s, v] of Object.entries(results)) {
      console.log(`${s.padEnd(15)} ${v.ok} passed, ${v.bad} failed`);
      ok2 += v.ok; bad2 += v.bad;
    }
    console.log(`TOTAL ${ok2} passed, ${bad2} failed | leftovers ${JSON.stringify(left)}`);
    await p.$disconnect();
  }
})();
