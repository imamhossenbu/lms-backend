/**
 * Live security regression: mass assignment, role escalation, cross-tenant admin actions, staff permissions
 * on legacy catalogue endpoints, AI settings ownership, audit-log scoping, CORS, headers, global validation.
 * Server on :4077. Everything created is removed in `finally`.
 */
import "dotenv/config";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../../src/prisma/prisma.service";

const BASE = process.env.LIVE_API_URL ?? "http://localhost:4077";
const p: any = new PrismaService();
const jwt = new JwtService({ secret: process.env.SUPER_SECRET_KEY });
const tag = `sec-test-${Date.now()}`;
let ok = 0, bad = 0;
const check = (name: string, cond: boolean, extra?: unknown) => {
  cond ? ok++ : bad++;
  console.log(cond ? "PASS" : "FAIL", name, cond ? "" : JSON.stringify(extra)?.slice(0, 400));
};
const call = async (token: string | null, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
  const r = await fetch(BASE + path, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body instanceof FormData ? {} : { "content-type": "application/json" }), ...headers }, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: r.status, body: json, headers: r.headers };
};
const tok = (u: any) => jwt.sign({ sub: u.id, email: u.email, role: u.role, institutionId: u.institutionId }, { expiresIn: "15m" });

(async () => {
  const ids: any = { institutions: [], users: [] };
  try {
    const plan = await p.saasPlan.findFirst({ where: { id: "pro" } });
    const mkInst = (n: string) => p.institution.create({ data: { name: `Sec ${n}`, slug: `${tag}-${n}`, logoInitials: "SC", type: "SCHOOL", country: "Bangladesh", ownerName: "T", ownerEmail: `${tag}-${n}@example.com`, planId: plan.id, status: "ACTIVE", currentPeriodStart: new Date(), currentPeriodEnd: new Date(Date.now() + 30 * 864e5) } });
    const A = await mkInst("a"), B = await mkInst("b");
    ids.institutions.push(A.id, B.id);
    const mkUser = async (n: string, role: string, institutionId: string | null, ageDays = 0) => {
      const u = await p.user.create({ data: { name: `Sec ${n}`, email: `${tag}-${n}@example.com`, password: "x", role, status: "ACTIVE", emailVerified: true, institutionId, createdAt: new Date(Date.now() - ageDays * 864e5) } });
      ids.users.push(u.id);
      return u;
    };
    const owner = await mkUser("owner", "ADMIN", A.id, 10);
    const support = await mkUser("support", "ADMIN", A.id, 5);
    const teacher = await mkUser("teacher", "TEACHER", A.id);
    const student = await mkUser("student", "STUDENT", A.id);
    const adminB = await mkUser("admin-b", "ADMIN", B.id);
    const studentB = await mkUser("student-b", "STUDENT", B.id);
    const TO = tok(owner), TS = tok(student), TT = tok(teacher), TB = tok(adminB);

    // workspace bootstrap → owner = Super Admin, support = Admin; then move support to the Support role
    let r = await call(TO, "GET", "/team/me");
    check("owner bootstraps team", r.status === 200 && r.body.isOwner, r.body);
    const roles = (await call(TO, "GET", "/team")).body.roles;
    const supportMember = await p.teamMember.findUnique({ where: { userId: support.id } });
    r = await call(TO, "PATCH", `/team/members/${supportMember.id}`, { roleId: roles.find((x: any) => x.name === "Support").id });
    check("support member → Support role", r.status === 200, r.body);
    const TSup = tok(support);

    // ---------------------------------------------------------------- mass assignment / escalation (/user)
    r = await call(TS, "PATCH", "/user/profile", { bio: "hello", role: "SUPER_ADMIN", status: "ACTIVE", institutionId: B.id, emailVerified: true, password: "hash" });
    const after = await p.user.findUnique({ where: { id: student.id } });
    check("profile: role/tenant/password ignored, bio saved", r.status === 200 && after.role === "STUDENT" && after.institutionId === A.id && after.password === "x" && after.bio === "hello", { status: r.status, role: after.role });
    r = await call(TS, "PATCH", "/user/profile", { name: "X" });
    check("profile: validated (name too short)", r.status === 400, r.body);
    r = await call(TO, "PATCH", "/user/admin/change-role", { userId: student.id, role: "SUPER_ADMIN" });
    check("change-role to SUPER_ADMIN → 400", r.status === 400, r.body);
    r = await call(TO, "PATCH", "/user/admin/change-role", { userId: student.id, role: "ADMIN" });
    check("change-role to ADMIN → 400", r.status === 400, r.body);
    r = await call(TO, "PATCH", "/user/admin/change-role", { userId: studentB.id, role: "TEACHER" });
    check("change-role other workspace → 404", r.status === 404, r.body);
    r = await call(TO, "PATCH", "/user/admin/change-role", { userId: support.id, role: "STUDENT" });
    check("change-role on a staff account → 403", r.status === 403, r.body);
    r = await call(TO, "PATCH", "/user/admin/change-role", { userId: owner.id, role: "STUDENT" });
    check("change own role → 403", r.status === 403, r.body);
    r = await call(TO, "PATCH", "/user/admin/change-role", { userId: student.id, role: "TEACHER" });
    check("change-role student → teacher", r.status === 200 && r.body.role === "TEACHER" && !("password" in r.body), r.body);
    await p.user.update({ where: { id: student.id }, data: { role: "STUDENT" } });
    r = await call(TO, "GET", "/user/all");
    check("/user/all: own workspace learners only", r.status === 200 && r.body.every((u: any) => u.institutionId === A.id && ["STUDENT", "TEACHER"].includes(u.role)) && !JSON.stringify(r.body).includes(studentB.id), r.body?.length);
    r = await call(TSup, "PATCH", "/user/admin/change-role", { userId: student.id, role: "TEACHER" });
    check("Support can't change roles (instructors.manage) → 403", r.status === 403, r.body);
    r = await call(TO, "PATCH", "/user/admin/change-status", { userId: studentB.id, status: "BLOCKED" });
    check("change-status other workspace → 404", r.status === 404, r.body);
    r = await call(TO, "DELETE", `/user/admin/${studentB.id}`);
    check("delete other workspace user → 404", r.status === 404, r.body);

    // ---------------------------------------------------------------- staff permissions on legacy catalogue
    r = await call(TO, "POST", "/categories", { name: "Sec", slug: `${tag}-cat`, institutionId: B.id });
    check("category: extra institutionId stripped (own workspace)", r.status === 201 && r.body.institutionId === A.id, r.body);
    const cat = r.body;
    const fd = new FormData();
    for (const [k, v] of Object.entries({ title: "Sec course", slug: `${tag}-c1`, description: "d", shortDescription: "s", categoryId: cat.id, level: "BEGINNER", language: "English", price: "1500", isFree: "false", durationMinutes: "45", status: "PUBLISHED" })) fd.append(k, v);
    r = await call(TO, "POST", "/courses", fd);
    check("course: multipart strings → numbers / booleans", r.status === 201 && Number(r.body.price) === 1500 && r.body.isFree === false && r.body.durationMinutes === 45, r.body);
    const course = r.body;
    r = await call(TO, "POST", "/courses", { title: "x", slug: `${tag}-c2`, description: "d", shortDescription: "s", categoryId: cat.id, level: "B", language: "E", price: "abc", durationMinutes: 1 });
    check("course: invalid price → 400", r.status === 400, r.body);
    r = await call(TSup, "POST", "/categories", { name: "Nope", slug: `${tag}-nope` });
    check("Support: create category → 403", r.status === 403, r.body);
    r = await call(TSup, "PATCH", `/courses/${course.id}`, { title: "nope" });
    check("Support: edit course → 403", r.status === 403, r.body);
    r = await call(TSup, "POST", `/courses/${course.id}/modules`, { title: "M", order: 1 });
    check("Support: add module → 403", r.status === 403, r.body);
    r = await call(TSup, "GET", "/coupon");
    check("Support: list coupons (no courses.view) → 403", r.status === 403, r.body);
    r = await call(TO, "PATCH", `/courses/${course.id}`, { title: "Owner edit" });
    check("Owner: edit course", r.status === 200 && r.body.title === "Owner edit", r.body);
    await p.course.update({ where: { id: course.id }, data: { instructorId: teacher.id } });
    r = await call(TT, "POST", `/courses/${course.id}/modules`, { title: "Teacher module", order: 1 });
    check("Teacher (not staff): add module to own course", r.status === 201, r.body);
    const mod = r.body;
    r = await call(TT, "POST", `/courses/${course.id}/modules/${mod.id}/lessons`, { title: "L", type: "TEXT", durationMinutes: 5, order: 1 });
    const lesson = r.body;
    r = await call(TT, "POST", `/courses/${course.id}/modules`, { title: "M2", order: 2 });
    const mod2 = r.body;
    r = await call(TT, "PATCH", `/courses/${course.id}/modules/${mod.id}/lessons/${lesson.id}`, { moduleId: mod2.id, status: "PUBLISHED" });
    check("lesson move within course + status kept", r.status === 200 && r.body.moduleId === mod2.id && r.body.status === "PUBLISHED", r.body);
    const otherCourse = await p.course.create({ data: { title: "Other", slug: `${tag}-other`, description: "d", shortDescription: "s", categoryId: cat.id, instructorId: owner.id, level: "B", language: "E", price: 0, status: "DRAFT", durationMinutes: 1, institutionId: A.id } });
    const otherMod = await p.courseModule.create({ data: { courseId: otherCourse.id, title: "OM", order: 1 } });
    r = await call(TT, "PATCH", `/courses/${course.id}/modules/${mod2.id}/lessons/${lesson.id}`, { moduleId: otherMod.id });
    check("lesson move into another course → 404", r.status === 404, r.body);

    // ---------------------------------------------------------------- reviews
    await p.enrollment.create({ data: { userId: student.id, courseId: course.id, status: "ACTIVE" } });
    r = await call(TS, "POST", "/review", { courseId: course.id, rating: 5, reviewText: "Great", status: "APPROVED" });
    check("review: status from client ignored", r.status === 201 && r.body.status === "PENDING", r.body);
    const rv = r.body;
    r = await call(TS, "PATCH", `/review/${rv.id}`, { rating: 4, status: "APPROVED" });
    check("review update: student can't self-approve", r.status === 200 && r.body.status === "PENDING", r.body);
    r = await call(TS, "POST", "/review", { courseId: course.id, rating: 9 });
    check("review: rating validated", r.status === 400, r.body);
    r = await call(TB, "PATCH", `/review/${rv.id}/status`, { status: "APPROVED" });
    check("review: other workspace admin can't moderate → 404", r.status === 404, r.body);
    r = await call(TB, "DELETE", `/review/${rv.id}`);
    check("review: other workspace admin can't delete → 403", r.status === 403, r.body);
    r = await call(TB, "GET", "/review/admin/all");
    check("review: admin list scoped", r.status === 200 && !JSON.stringify(r.body).includes(rv.id), r.body);
    r = await call(TO, "PATCH", `/review/${rv.id}/status`, { status: "APPROVED" });
    check("review: own workspace admin approves", r.status === 200 && r.body.status === "APPROVED", r.body);

    // ---------------------------------------------------------------- audit log, AI settings, analytics
    r = await call(TO, "GET", "/admin/activity-logs?limit=5");
    check("activity log: paginated + own workspace", r.status === 200 && Array.isArray(r.body.data) && r.body.meta.limit === 5, r.body);
    r = await call(TB, "GET", "/admin/activity-logs?limit=100");
    check("activity log: B can't see A's users", r.status === 200 && !JSON.stringify(r.body).includes(owner.id) && !JSON.stringify(r.body).includes(student.id), r.body?.meta);
    r = await call(TSup, "GET", "/admin/activity-logs");
    check("activity log: Support (no team.view) → 403", r.status === 403, r.body);
    r = await call(TO, "GET", "/admin/activity-logs?limit=1000");
    check("activity log: limit validated", r.status === 400, r.body);
    r = await call(TO, "POST", "/ai-settings", { featureKey: "x", config: { provider: "x", modelName: "x", baseUrl: "https://evil.example", maxTokens: 1, temperature: 0, systemPrompt: "", isActive: true } });
    check("AI settings: workspace admin can't change platform AI → 403", r.status === 403, r.body);
    r = await call(TSup, "POST", "/ai/generate-quiz", {});
    check("AI authoring: Support (no courses.manage) → 403", r.status === 403, r.body);

    // ---------------------------------------------------------------- transport: CORS, headers, health
    r = await call(null, "GET", "/health", undefined, { origin: "https://evil.com" });
    check("health ok", r.status === 200 && r.body.status === "ok", r.body);
    check("CORS: evil origin not allowed", !r.headers.get("access-control-allow-origin"), Object.fromEntries(r.headers));
    r = await call(null, "GET", "/health", undefined, { origin: "http://localhost:3000" });
    check("CORS: panel origin allowed", r.headers.get("access-control-allow-origin") === "http://localhost:3000", Object.fromEntries(r.headers));
    check("helmet headers", r.headers.get("x-content-type-options") === "nosniff" && !!r.headers.get("strict-transport-security") && !r.headers.get("x-powered-by"), Object.fromEntries(r.headers));
    r = await call(null, "GET", "/courses?limit=500");
    check("global validation on public query (limit ≤ 100)", r.status === 400, r.body);
  } catch (e) {
    console.log("FAIL exception", e);
    bad++;
  } finally {
    const users = ids.users;
    const courses = (await p.course.findMany({ where: { slug: { startsWith: tag } }, select: { id: true } })).map((c: any) => c.id);
    await p.courseReview.deleteMany({ where: { OR: [{ courseId: { in: courses } }, { userId: { in: users } }] } });
    await p.enrollment.deleteMany({ where: { OR: [{ courseId: { in: courses } }, { userId: { in: users } }] } });
    await p.course.deleteMany({ where: { id: { in: courses } } });
    await p.category.deleteMany({ where: { slug: { startsWith: tag } } });
    for (const t of ["teamEvent", "teamMember", "teamRole"]) await p[t].deleteMany({ where: { institutionId: { in: ids.institutions } } });
    await p.activityLog.deleteMany({ where: { userId: { in: users } } });
    await p.user.deleteMany({ where: { OR: [{ id: { in: users } }, { email: { startsWith: tag } }] } });
    await p.institution.deleteMany({ where: { id: { in: ids.institutions } } });
    const left = await p.$queryRawUnsafe(`select (select count(*)::int from "Course" where slug like '${tag}%') courses, (select count(*)::int from "User" where email like '${tag}%') users, (select count(*)::int from institutions where slug like '${tag}%') insts`);
    console.log(`\n${ok} passed, ${bad} failed | leftovers ${JSON.stringify(left)}`);
    await p.$disconnect();
  }
})();
