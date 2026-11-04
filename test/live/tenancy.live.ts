/**
 * Live test: catalogue multi-tenancy. Two institutions (A, B) each build a catalogue with the SAME slugs;
 * everything one workspace tries against the other's courses / categories / modules / lessons / coupons must 404.
 * Server on :4077. Everything created is removed in `finally`.
 */
import "dotenv/config";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../../src/prisma/prisma.service";

const BASE = process.env.LIVE_API_URL ?? "http://localhost:4077";
const p: any = new PrismaService();
const jwt = new JwtService({ secret: process.env.SUPER_SECRET_KEY });
const tag = `ten-test-${Date.now()}`;
let ok = 0, bad = 0;
const check = (name: string, cond: boolean, extra?: unknown) => {
  cond ? ok++ : bad++;
  console.log(cond ? "PASS" : "FAIL", name, cond ? "" : JSON.stringify(extra)?.slice(0, 400));
};
const call = async (token: string | null, method: string, path: string, body?: unknown) => {
  const r = await fetch(BASE + path, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: r.status, body: json };
};
const tok = (u: any) => jwt.sign({ sub: u.id, email: u.email, role: u.role, institutionId: u.institutionId }, { expiresIn: "15m" });
const has = (r: any, id: string) => JSON.stringify(r.body).includes(id);

(async () => {
  const ids: any = { institutions: [], users: [] };
  try {
    const plan = await p.saasPlan.findFirst({ where: { id: "pro" } });
    const mkInst = (n: string) =>
      p.institution.create({ data: { name: `Ten ${n}`, slug: `${tag}-${n}`, logoInitials: "TT", type: "SCHOOL", country: "Bangladesh", ownerName: "T", ownerEmail: `${tag}-${n}@example.com`, planId: plan.id, status: "ACTIVE", currentPeriodStart: new Date(), currentPeriodEnd: new Date(Date.now() + 30 * 864e5) } });
    const A = await mkInst("a"), B = await mkInst("b");
    ids.institutions.push(A.id, B.id);
    const mkUser = async (n: string, role: string, institutionId: string | null) => {
      const u = await p.user.create({ data: { name: `Ten ${n}`, email: `${tag}-${n}@example.com`, password: "x", role, status: "ACTIVE", emailVerified: true, institutionId } });
      ids.users.push(u.id);
      return u;
    };
    const adminA = await mkUser("admin-a", "ADMIN", A.id), adminB = await mkUser("admin-b", "ADMIN", B.id);
    const studentA = await mkUser("student-a", "STUDENT", A.id);
    const TA = tok(adminA), TB = tok(adminB), SA = tok(studentA);

    // ---------------------------------------------------------------- same slugs in two workspaces
    let r = await call(TA, "POST", "/categories", { name: "Web", slug: `${tag}-web` });
    check("A creates category", r.status === 201 && r.body.institutionId === A.id, r.body);
    const catA = r.body;
    r = await call(TB, "POST", "/categories", { name: "Web", slug: `${tag}-web` });
    check("B creates category with the SAME slug", r.status === 201 && r.body.institutionId === B.id, r.body);
    const catB = r.body;
    r = await call(TA, "POST", "/categories", { name: "Web 2", slug: `${tag}-web` });
    check("duplicate slug inside A → 409", r.status === 409, r.body);

    const course = (cat: string, slug: string, price = 0) => ({ title: `Course ${slug}`, slug, description: "d", shortDescription: "s", categoryId: cat, level: "BEGINNER", language: "English", price, isFree: price === 0, durationMinutes: 30, status: "PUBLISHED" });
    r = await call(TA, "POST", "/courses", course(catB.id, `${tag}-react`));
    check("A can't use B's category → 404", r.status === 404, r.body);
    r = await call(TA, "POST", "/courses", course(catA.id, `${tag}-react`));
    check("A creates course", r.status === 201 && r.body.institutionId === A.id, r.body);
    const cA = r.body;
    r = await call(TB, "POST", "/courses", course(catB.id, `${tag}-react`, 500));
    check("B creates course with the SAME slug", r.status === 201 && r.body.institutionId === B.id, r.body);
    const cB = r.body;
    r = await call(TA, "POST", "/courses", course(catA.id, `${tag}-react`));
    check("duplicate course slug inside A → 409", r.status === 409, r.body);

    // ---------------------------------------------------------------- reads are scoped
    r = await call(TA, "GET", "/courses?limit=100");
    check("A's list has A's course only", r.status === 200 && has(r, cA.id) && !has(r, cB.id), r.body);
    r = await call(TB, "GET", "/courses?limit=100");
    check("B's list has B's course only", has(r, cB.id) && !has(r, cA.id), r.body);
    r = await call(null, "GET", `/courses?limit=100&institution=${A.slug}`);
    check("public ?institution=A → A's catalogue", has(r, cA.id) && !has(r, cB.id), r.body);
    r = await call(null, "GET", "/courses?limit=100");
    check("public (no slug) → legacy only", r.status === 200 && !has(r, cA.id) && !has(r, cB.id), r.body);
    r = await call(null, "GET", `/courses?institution=nope-${tag}`);
    check("unknown workspace → 404", r.status === 404, r.body);
    r = await call("not-a-token", "GET", "/courses");
    check("invalid token → 401 (no silent fallback)", r.status === 401, r.body);
    r = await call(TB, "GET", `/courses/${cA.id}`);
    check("B GET A's course → 404", r.status === 404, r.body);
    r = await call(TA, "GET", `/courses/${cA.id}`);
    check("A GET own course", r.status === 200 && r.body.id === cA.id, r.body);
    r = await call(TA, "GET", "/categories");
    check("A's categories only", has(r, catA.id) && !has(r, catB.id), r.body);

    // ---------------------------------------------------------------- writes are scoped
    r = await call(TB, "PATCH", `/courses/${cA.id}`, { title: "hacked" });
    check("B PATCH A's course → 404", r.status === 404, r.body);
    r = await call(TB, "DELETE", `/courses/${cA.id}`);
    check("B DELETE A's course → 404", r.status === 404, r.body);
    r = await call(TB, "PATCH", `/categories/${catA.id}`, { name: "hacked" });
    check("B PATCH A's category → 404", r.status === 404, r.body);
    r = await call(TB, "DELETE", `/categories/${catA.id}`);
    check("B DELETE A's category → 404", r.status === 404, r.body);
    r = await call(TA, "DELETE", `/categories/${catA.id}`);
    check("delete category in use → 409", r.status === 409, r.body);

    // ---------------------------------------------------------------- modules / lessons / resources hierarchy
    r = await call(TA, "POST", `/courses/${cA.id}/modules`, { title: "M1", order: 1 });
    check("A creates module", r.status === 201, r.body);
    const mA = r.body;
    r = await call(TA, "POST", `/courses/${cA.id}/modules/${mA.id}/lessons`, { title: "L1", type: "TEXT", content: "<p>x</p>", durationMinutes: 5, order: 1, status: "PUBLISHED" });
    check("A creates lesson", r.status === 201, r.body);
    const lA = r.body;
    r = await call(TB, "POST", `/courses/${cB.id}/modules`, { title: "MB", order: 1 });
    const mB = r.body;
    r = await call(TB, "GET", `/courses/${cA.id}/modules`);
    check("B lists A's modules → 404", r.status === 404, r.body);
    r = await call(TB, "POST", `/courses/${cA.id}/modules`, { title: "evil", order: 9 });
    check("B adds module to A's course → 404", r.status === 404, r.body);
    r = await call(TB, "PATCH", `/courses/${cB.id}/modules/${mA.id}`, { title: "hacked" });
    check("B edits A's module via B's own course URL → 404", r.status === 404, r.body);
    r = await call(TB, "DELETE", `/courses/${cB.id}/modules/${mA.id}`);
    check("B deletes A's module via B's URL → 404", r.status === 404, r.body);
    r = await call(TB, "PATCH", `/courses/${cB.id}/modules/${mB.id}/lessons/${lA.id}`, { title: "hacked" });
    check("B edits A's lesson via B's module URL → 404", r.status === 404, r.body);
    r = await call(TB, "GET", `/lessons/${lA.id}/resources`);
    check("B lists A's lesson resources → 404", r.status === 404, r.body);
    r = await call(TA, "PATCH", `/courses/${cA.id}/modules/${mA.id}/lessons/${lA.id}`, { title: "L1 edited" });
    check("A edits own lesson", r.status === 200 && r.body.title === "L1 edited", r.body);
    r = await call(TA, "GET", `/lessons/${lA.id}/resources`);
    check("A lists own lesson resources", r.status === 200, r.body);

    // ---------------------------------------------------------------- coupons
    const coupon = (courseId: string, code: string) => ({ code, discountType: "PERCENTAGE", discountTypeValue: 10, courseId, maxUses: 5, startDate: new Date(Date.now() - 864e5).toISOString(), endDate: new Date(Date.now() + 864e5).toISOString(), status: "ACTIVE" });
    const code = `T${Date.now() % 1000000}`;
    r = await call(TA, "POST", "/coupon", coupon(cA.id, code));
    check("A creates coupon", r.status === 201 && r.body.institutionId === A.id, r.body);
    const cpA = r.body;
    r = await call(TB, "POST", "/coupon", coupon(cA.id, `${code}X`));
    check("B coupon on A's course → 404", r.status === 404, r.body);
    r = await call(TB, "POST", "/coupon", coupon(cB.id, code));
    check("B creates the SAME code for its own course", r.status === 201, r.body);
    r = await call(TA, "POST", "/coupon", coupon(cA.id, code));
    check("duplicate code inside A → 409", r.status === 409, r.body);
    r = await call(TA, "POST", "/coupon", { ...coupon(cA.id, `${code}Y`), discountTypeValue: 150 });
    check("percentage over 100 → 400", r.status === 400, r.body);
    r = await call(TA, "POST", "/coupon", { ...coupon(cA.id, `${code}Z`), courseId: "nope" });
    check("invalid body → 400 (DTO now validated)", r.status === 400, r.body);
    r = await call(TB, "GET", "/coupon");
    check("B's coupon list excludes A's", r.status === 200 && !has(r, cpA.id), r.body);
    r = await call(TB, "GET", `/coupon/${cpA.id}`);
    check("B GET A's coupon → 404", r.status === 404, r.body);
    r = await call(null, "GET", `/coupon/validate/${code.toLowerCase()}/${cA.id}`);
    check("validate code against A's course", r.status === 200 && r.body.id === cpA.id, r.body);
    r = await call(TA, "PATCH", `/coupon/${cpA.id}`, { maxUses: 9 });
    check("A updates coupon", r.status === 200 && r.body.maxUses === 9, r.body);
    r = await call(TA, "DELETE", `/coupon/${cpA.id}`);
    check("A deletes coupon", r.status === 200, r.body);

    // ---------------------------------------------------------------- other modules taking a courseId
    r = await call(TA, "POST", "/students", { name: "Ten Stu", email: `${tag}-stu2@example.com`, status: "Active", enrolledCourseIds: [cB.id] });
    check("students: enroll in B's course → 404", r.status === 404, r.body);
    r = await call(TA, "POST", `/students/${studentA.id}/enrollments`, { courseIds: [cA.id] });
    check("students: enroll in own course", r.status === 201 || r.status === 200, r.body);
    r = await call(TA, "POST", "/admin/orders", { studentId: studentA.id, courseId: cB.id, method: "bKash", markAsPaid: false });
    check("admin orders: B's course → 404", r.status === 404, r.body);
    const q1 = { id: "q-a", kind: "MULTIPLE_CHOICE", questionHtml: "<p>What is useState used for?</p>", options: [{ id: "o1", text: "A" }, { id: "o2", text: "B" }], correctOptionIds: ["o1"], acceptedAnswers: [], explanationHtml: "", points: 5, timeLimitSeconds: null, required: true, shuffleOptions: false };
    const quiz = (courseId: string, moduleId: string) => ({ title: "Quiz", courseId, moduleId, difficulty: "BEGINNER", descriptionHtml: "<p>Check your React knowledge.</p>", instructionsHtml: "", questions: [q1], passingMarks: 3, timeLimitMinutes: 10, maxAttempts: "2", showCorrectAnswers: true, showExplanation: true, randomizeQuestions: false, randomizeOptions: false, startDate: "", endDate: "", access: "ENROLLED", requirePreviousLessons: false, showImmediately: true });
    r = await call(TA, "POST", "/admin/quizzes", quiz(cB.id, mB.id));
    check("quizzes: B's course → 404", r.status === 404, r.body);
    r = await call(TA, "POST", "/admin/quizzes", quiz(cA.id, mA.id));
    check("quizzes: own course ok", r.status === 201, r.body);
    r = await call(TA, "POST", "/admin/community/threads", { title: "Hello there", category: "QUESTION", courseId: cB.id, moduleId: mB.id, bodyHtml: "<p>Hi all, how does this work exactly?</p>", tags: [], isPinned: false, isLocked: false });
    check("community: thread on B's course → 404", r.status === 404, r.body);
    r = await call(TA, "POST", "/admin/certificates/issue", { courseId: cB.id, recipientId: studentA.id, grade: null, completedAt: new Date().toISOString().slice(0, 10), sendEmail: false, note: "" });
    check("certificates: issue on B's course → 404", r.status === 404, r.body);
    r = await call(SA, "POST", `/enrollments/free/${cB.id}`);
    check("student: free-enroll in B's course → 404", r.status === 404, r.body);
    r = await call(SA, "POST", "/orders", { courseId: cB.id });
    check("student: checkout B's course → 404", r.status === 404, r.body);
    r = await call(SA, "GET", "/courses?limit=100");
    check("student sees own workspace catalogue", has(r, cA.id) && !has(r, cB.id), r.body);

    // ---------------------------------------------------------------- cleanup through the API
    r = await call(TA, "DELETE", `/courses/${cA.id}/modules/${mA.id}`);
    check("A deletes module", r.status === 200, r.body);
  } catch (e) {
    console.log("FAIL exception", e);
    bad++;
  } finally {
    const users = ids.users;
    const courses = (await p.course.findMany({ where: { slug: { startsWith: tag } }, select: { id: true } })).map((c: any) => c.id);
    const inC = { courseId: { in: courses } };
    await p.quiz.deleteMany({ where: inC });
    await p.discussion.deleteMany({ where: inC }).catch(() => {});
    await p.order.deleteMany({ where: { OR: [inC, { userId: { in: users } }] } });
    await p.coupon.deleteMany({ where: { OR: [inC, { institutionId: { in: ids.institutions } }] } });
    await p.enrollment.deleteMany({ where: { OR: [inC, { userId: { in: users } }] } });
    await p.course.deleteMany({ where: { id: { in: courses } } });
    await p.category.deleteMany({ where: { slug: { startsWith: tag } } });
    for (const t of ["teamEvent", "teamMember", "teamRole"]) await p[t].deleteMany({ where: { institutionId: { in: ids.institutions } } });
    await p.activityLog.deleteMany({ where: { userId: { in: users } } });
    await p.user.deleteMany({ where: { OR: [{ id: { in: users } }, { email: { startsWith: tag } }] } });
    await p.institution.deleteMany({ where: { id: { in: ids.institutions } } });
    const left = await p.$queryRawUnsafe(`select (select count(*)::int from "Course" where slug like '${tag}%') courses, (select count(*)::int from "Category" where slug like '${tag}%') cats, (select count(*)::int from "User" where email like '${tag}%') users, (select count(*)::int from institutions where slug like '${tag}%') insts`);
    console.log(`\n${ok} passed, ${bad} failed | leftovers ${JSON.stringify(left)}`);
    await p.$disconnect();
  }
})();
