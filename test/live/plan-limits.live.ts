/**
 * Live test: server-side plan enforcement (limits on live counts, feature gates, downgrade checks, suspended
 * workspaces, usage counters). Server on :4077. Everything created is removed in `finally`.
 */
import "dotenv/config";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../../src/prisma/prisma.service";

const BASE = process.env.LIVE_API_URL ?? "http://localhost:4077";
const p: any = new PrismaService();
const jwt = new JwtService({ secret: process.env.SUPER_SECRET_KEY });
const tag = `plan-test-${Date.now()}`;
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
const codeOf = (r: any) => r.body?.code;

(async () => {
  const ids: any = { users: [] as string[], plan: null as string | null, inst: null as string | null };
  try {
    const SA = jwt.sign({ sub: "00000000-0000-0000-0000-000000000000", email: "o@x", role: "SUPER_ADMIN" }, { expiresIn: "15m" });
    let r = await call(SA, "POST", "/saas/owner/plans", { name: `Tiny ${Date.now() % 100000}`, tagline: "Tiny test plan", priceMonthly: 10, priceYearly: 100, limits: { students: 2, courses: 1, teamMembers: 2, storageGb: 1 }, features: [], highlighted: false, isPublic: true, trialDays: 14 });
    check("create tiny plan", r.status === 201, r.body);
    ids.plan = r.body.id;
    r = await call(SA, "POST", "/saas/owner/institutions", { name: "Plan Test", type: "SCHOOL", country: "Bangladesh", ownerName: "Zz", ownerEmail: `${tag}-inst@example.com`, phone: "", slug: tag.slice(0, 30), planId: "growth", cycle: "MONTHLY", startWithTrial: false, trialDays: 14, notes: "" });
    check("institution on Growth", r.status === 201, r.body);
    const inst = r.body; ids.inst = inst.id;
    const owner = await p.user.create({ data: { name: "Plan Owner", email: `${tag}-owner@example.com`, password: "x", role: "ADMIN", status: "ACTIVE", emailVerified: true, institutionId: inst.id } });
    ids.users.push(owner.id);
    const TO = tok(owner);
    await call(TO, "GET", "/team/me"); // bootstrap workspace (owner = 1 seat)

    // ---------------------------------------------------------------- usage counters + downgrade check on REAL usage
    const studentIds: string[] = [];
    for (let i = 1; i <= 3; i++) {
      r = await call(TO, "POST", "/students", { name: `Plan Student ${i}`, email: `${tag}-s${i}@example.com`, status: "Active" });
      studentIds.push(r.body.id); ids.users.push(r.body.id);
    }
    check("3 students created on Growth", studentIds.every(Boolean), studentIds);
    r = await call(TO, "GET", "/saas/me");
    check("/saas/me usage = real counts", r.status === 200 && r.body.institution.usage.students === 3 && r.body.institution.usage.teamMembers === 1, r.body?.institution?.usage);
    r = await call(SA, "POST", `/saas/owner/institutions/${inst.id}/change-plan`, { planId: ids.plan, cycle: "MONTHLY" });
    check("downgrade blocked: 3 students > 2", r.status === 400 && /Students 3 \/ 2/.test(r.body.message), r.body);
    await call(TO, "DELETE", `/students/${studentIds[2]}`);
    r = await call(SA, "POST", `/saas/owner/institutions/${inst.id}/change-plan`, { planId: ids.plan, cycle: "MONTHLY" });
    check("downgrade allowed after removing a student", r.status === 200 && r.body.institution.subscription.planId === ids.plan, r.body);

    // ---------------------------------------------------------------- limits
    r = await call(TO, "POST", "/students", { name: "Plan Student 4", email: `${tag}-s4@example.com`, status: "Active" });
    check("students: 3rd on a 2-student plan → PLAN_LIMIT_REACHED", r.status === 403 && codeOf(r) === "PLAN_LIMIT_REACHED" && r.body.limit === "students", r.body);
    r = await call(TO, "POST", "/categories", { name: "Plan Cat", slug: `${tag}-cat` });
    const cat = r.body;
    const course = (n: string) => ({ title: `Plan ${n}`, slug: `${tag}-${n}`, description: "d", shortDescription: "s", categoryId: cat.id, level: "BEGINNER", language: "English", price: 0, isFree: true, durationMinutes: 10, status: "PUBLISHED" });
    r = await call(TO, "POST", "/courses", course("c1"));
    check("courses: 1st course ok", r.status === 201, r.body);
    const c1 = r.body;
    r = await call(TO, "POST", "/courses", course("c2"));
    check("courses: 2nd on a 1-course plan → PLAN_LIMIT_REACHED", r.status === 403 && codeOf(r) === "PLAN_LIMIT_REACHED", r.body);
    r = await call(TO, "POST", "/instructors", { name: "Plan Teacher", email: `${tag}-t1@example.com`, status: "Active" });
    check("seats: instructor = 2nd seat ok", r.status === 201, r.body);
    if (r.body?.id) ids.users.push(r.body.id);
    const roles = (await call(TO, "GET", "/team")).body.roles;
    r = await call(TO, "POST", "/team/invitations", { emails: [`${tag}-inv@example.com`], roleId: roles.find((x: any) => x.name === "Support").id });
    check("seats: invite beyond 2 seats → PLAN_LIMIT_REACHED", r.status === 403 && codeOf(r) === "PLAN_LIMIT_REACHED" && r.body.limit === "teamMembers", r.body);
    r = await call(TO, "PATCH", "/user/admin/change-role", { userId: studentIds[0], role: "TEACHER" });
    check("seats: promoting a student to instructor → PLAN_LIMIT_REACHED", r.status === 403 && codeOf(r) === "PLAN_LIMIT_REACHED", r.body);

    // ---------------------------------------------------------------- feature gates (tiny plan has none)
    r = await call(TO, "POST", "/admin/live-classes", {});
    check("live classes gated", r.status === 403 && codeOf(r) === "PLAN_FEATURE_REQUIRED" && r.body.feature === "liveClasses" && r.body.requiredPlanId === "growth", r.body);
    r = await call(TO, "POST", "/admin/certificates/issue", {});
    check("certificates gated", r.status === 403 && r.body.feature === "certificates", r.body);
    r = await call(TO, "POST", "/admin/community/threads", {});
    check("community gated", r.status === 403 && r.body.feature === "community", r.body);
    r = await call(TO, "POST", "/ai/generate-quiz", {});
    check("AI gated", r.status === 403 && r.body.feature === "aiAssistant", r.body);
    const settings = (await call(TO, "GET", "/admin/settings")).body;
    const branding = settings.settings?.branding ?? settings.branding;
    r = await call(TO, "PATCH", "/admin/settings/branding", { ...branding, showPoweredBy: false });
    check("white-label: hiding 'Powered by' gated", r.status === 403 && r.body.feature === "whiteLabel", r.body);
    r = await call(TO, "PATCH", "/admin/settings/branding", { ...branding, showPoweredBy: true, loginHeadline: "Hello" });
    check("branding edit without hiding branding still works", r.status === 200, r.body);

    // ---------------------------------------------------------------- upgrade unlocks
    r = await call(SA, "POST", `/saas/owner/institutions/${inst.id}/change-plan`, { planId: "growth", cycle: "MONTHLY" });
    check("upgrade back to Growth", r.status === 200, r.body);
    r = await call(TO, "POST", "/admin/community/threads", { title: "Hello there", category: "QUESTION", courseId: c1.id, moduleId: "", bodyHtml: "<p>Hi all, how does this work exactly?</p>", tags: [], isPinned: false, isLocked: false });
    check("community allowed on Growth (not a plan error)", r.status !== 403, r.body);
    r = await call(TO, "POST", "/courses", course("c2"));
    check("courses: 2nd course allowed on Growth", r.status === 201, r.body);

    // ---------------------------------------------------------------- suspended workspace
    await call(SA, "POST", `/saas/owner/institutions/${inst.id}/suspend`, { reason: "Testing suspension" });
    r = await call(TO, "POST", "/courses", course("c3"));
    check("suspended: creating → WORKSPACE_INACTIVE", r.status === 403 && codeOf(r) === "WORKSPACE_INACTIVE", r.body);
    r = await call(TO, "POST", "/admin/community/threads", {});
    check("suspended: features → WORKSPACE_INACTIVE", r.status === 403 && codeOf(r) === "WORKSPACE_INACTIVE", r.body);
    await call(SA, "POST", `/saas/owner/institutions/${inst.id}/unsuspend`);
    r = await call(SA, "GET", `/saas/owner/institutions/${inst.id}`);
    check("owner console sees real usage", r.body.institution.usage.students === 2 && r.body.institution.usage.courses === 2 && r.body.institution.usage.teamMembers === 2, r.body.institution.usage);
  } catch (e) {
    console.log("FAIL exception", e);
    bad++;
  } finally {
    if (ids.inst) {
      const users = (await p.user.findMany({ where: { OR: [{ institutionId: ids.inst }, { email: { startsWith: tag } }] }, select: { id: true } })).map((u: any) => u.id);
      await p.discussion.deleteMany({ where: { institutionId: ids.inst } }).catch(() => {});
      await p.enrollment.deleteMany({ where: { userId: { in: users } } });
      await p.course.deleteMany({ where: { institutionId: ids.inst } });
      await p.category.deleteMany({ where: { institutionId: ids.inst } });
      for (const t of ["teamEvent", "teamMember", "teamRole"]) await p[t].deleteMany({ where: { institutionId: ids.inst } });
      await p.workspaceSettings.deleteMany({ where: { institutionId: ids.inst } }).catch(() => {});
      await p.activityLog.deleteMany({ where: { userId: { in: users } } });
      await p.user.deleteMany({ where: { id: { in: users } } });
      await p.institution.deleteMany({ where: { id: ids.inst } });
    }
    if (ids.plan) await p.saasPlan.deleteMany({ where: { id: ids.plan } });
    const left = await p.$queryRawUnsafe(`select (select count(*)::int from "User" where email like '${tag}%') users, (select count(*)::int from "Course" where slug like '${tag}%') courses, (select count(*)::int from saas_plans where id = '${ids.plan}') plans`);
    console.log(`\n${ok} passed, ${bad} failed | leftovers ${JSON.stringify(left)}`);
    await p.$disconnect();
  }
})();
