// Live test for /admin/notifications + /notification + /announcement.
// Copy to the backend repo root and run (server on :4077):  npx ts-node --transpile-only live-notifications.ts
import "dotenv/config";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "./src/prisma/prisma.service";

const BASE = "http://localhost:4077";
const p: any = new PrismaService();
const jwt = new JwtService({ secret: process.env.SUPER_SECRET_KEY });
const tag = `notif-test-${Date.now()}`;
let ok = 0, bad = 0;
const check = (name: string, cond: boolean, extra?: unknown) => { cond ? ok++ : bad++; console.log(cond ? "PASS" : "FAIL", name, cond ? "" : JSON.stringify(extra)?.slice(0, 500)); };
const call = async (token: string, method: string, path: string, body?: unknown) => {
  const r = await fetch(BASE + path, { method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let json: any; try { json = JSON.parse(text); } catch { json = text; }
  return { status: r.status, body: json };
};
const msg = (r: { body: any }) => JSON.stringify(r.body?.message ?? r.body);
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

(async () => {
  const ids: any = { users: [], institutions: [] };
  try {
    const plan = await p.saasPlan.findFirst();
    const mkInst = (n: string) => p.institution.create({ data: { name: `${tag}-${n}`, slug: `${tag}-${n}`, logoInitials: "NT", type: "UNIVERSITY", country: "BD", ownerName: "T", ownerEmail: `${tag}-${n}@example.com`, planId: plan.id, status: "ACTIVE", currentPeriodStart: new Date(), currentPeriodEnd: new Date(Date.now() + 864e5 * 30) } });
    const inst = await mkInst("a"), inst2 = await mkInst("b");
    ids.institutions.push(inst.id, inst2.id);
    const mkUser = (n: string, role: string, institutionId: string, extra: object = {}) => p.user.create({ data: { name: `User ${n}`, email: `${tag}-${n}@example.com`, password: "x", role, status: "ACTIVE", institutionId, lastLoginAt: new Date(), ...extra } });
    const admin = await mkUser("admin", "ADMIN", inst.id), admin2 = await mkUser("admin2", "ADMIN", inst2.id);
    const s1 = await mkUser("s1", "STUDENT", inst.id), s2 = await mkUser("s2", "STUDENT", inst.id);
    const s3 = await mkUser("s3", "STUDENT", inst.id, { lastLoginAt: null }); // not enrolled, inactive
    const blocked = await mkUser("blocked", "STUDENT", inst.id, { status: "BLOCKED" });
    const other = await mkUser("other", "STUDENT", inst2.id); // other tenant, enrolled in the same course
    const teacher = await mkUser("teacher", "TEACHER", inst.id);
    ids.users.push(admin.id, admin2.id, s1.id, s2.id, s3.id, blocked.id, other.id, teacher.id);

    const cat = await p.category.create({ data: { name: tag, slug: tag, status: "ACTIVE" } }); ids.category = cat.id;
    const course = await p.course.create({ data: { title: `${tag} course`, slug: tag, description: "d", shortDescription: "d", categoryId: cat.id, instructorId: teacher.id, level: "BEGINNER", language: "EN", price: 0, status: "PUBLISHED", durationMinutes: 10 } });
    ids.course = course.id;
    await p.courseModule.create({ data: { courseId: course.id, title: "M1", order: 1 } });
    await p.enrollment.createMany({ data: [s1, s2, blocked, other].map((s: any) => ({ userId: s.id, courseId: course.id, status: "ACTIVE" })) });

    const tok = (u: any) => jwt.sign({ sub: u.id, email: u.email, role: u.role, institutionId: u.institutionId }, { expiresIn: "15m" });
    const A = tok(admin), A2 = tok(admin2), S1 = tok(s1), O = tok(other);

    const base = { title: "Exam week schedule", messageHtml: "<p>Exams start on <strong>Monday</strong>.</p><script>alert(1)</script>", audience: "COURSE", courseIds: [course.id], channels: ["IN_APP", "PUSH"], priority: "HIGH", ctaLabel: "Open course", ctaUrl: "/courses", timing: "NOW", scheduledAt: "" };

    // ---- validation
    let r = await call(A, "POST", "/admin/notifications/broadcasts", { ...base, title: "Hi", messageHtml: "<p>x</p>", channels: [] });
    check("dto messages 400", r.status === 400 && msg(r).includes("Title must be at least 5 characters") && msg(r).includes("Write at least 10 characters") && msg(r).includes("Choose at least one channel"), r.body);
    r = await call(A, "POST", "/admin/notifications/broadcasts", { ...base, courseIds: [] });
    check("course audience needs courses 400", r.status === 400 && msg(r).includes("Select at least one course"), r.body);
    r = await call(A, "POST", "/admin/notifications/broadcasts", { ...base, ctaUrl: "" });
    check("cta pairing 400", r.status === 400 && msg(r).includes("Add both a button label and a link"), r.body);
    r = await call(A, "POST", "/admin/notifications/broadcasts", { ...base, timing: "SCHEDULE", scheduledAt: new Date(Date.now() + 60_000).toISOString() });
    check("schedule lead 400", r.status === 400 && msg(r).includes("Schedule at least 5 minutes from now"), r.body);
    r = await call(S1, "GET", "/admin/notifications/broadcasts");
    check("student 403 on admin", r.status === 403, r.body);

    // ---- estimate + send now to a course audience
    r = await call(A, "GET", `/admin/notifications/broadcasts/estimate?audience=COURSE&courseIds=${course.id}`);
    check("estimate = own-tenant active enrolled students", r.status === 200 && r.body.recipients === 2, r.body);
    r = await call(A, "GET", "/admin/notifications/broadcasts/estimate?audience=INACTIVE_STUDENTS");
    check("inactive estimate", r.status === 200 && r.body.recipients === 1, r.body);

    r = await call(A, "POST", "/admin/notifications/broadcasts", base);
    check("send now 201", r.status === 201 && r.body.status === "SENT" && r.body.recipients === 2 && r.body.delivery?.failed === 2 && !r.body.messageHtml.includes("script"), r.body);
    const sent = r.body;
    const otherNotes = await p.notification.count({ where: { userId: { in: [other.id, blocked.id, s3.id] } } });
    check("other tenant / blocked / unenrolled got nothing", otherNotes === 0, otherNotes);

    r = await call(A, "GET", `/admin/notifications/broadcasts/${sent.id}`);
    check("detail stats", r.status === 200 && r.body.stats.total === 4 && r.body.stats.failed === 2 && r.body.stats.recipients === 2 && r.body.byChannel.length === 2 && r.body.opensTimeline.length === 24, r.body);
    r = await call(A, "GET", `/admin/notifications/broadcasts/${sent.id}/deliveries?channel=PUSH`);
    check("deliveries filter", r.status === 200 && r.body.meta.total === 2 && r.body.data[0].status === "FAILED" && r.body.data[0].recipient.email.endsWith("@example.com"), r.body);
    r = await call(A, "PATCH", `/admin/notifications/broadcasts/${sent.id}`, base);
    check("sent not editable 400", r.status === 400 && msg(r).includes("Duplicate it instead"), r.body);
    r = await call(A, "DELETE", `/admin/notifications/broadcasts/${sent.id}`);
    check("sent not deletable 400", r.status === 400, r.body);

    // ---- student inbox
    r = await call(S1, "GET", "/notification/unread-count");
    check("student unread 1", r.status === 200 && r.body.count === 1, r.body);
    r = await call(S1, "GET", "/notification?status=unread");
    const note = r.body.data?.[0];
    check("student inbox shape", r.status === 200 && note?.title === base.title && note.priority === "HIGH" && note.href === "/courses" && note.message.includes("Monday"), r.body);
    r = await call(O, "PATCH", `/notification/${note.id}/read`);
    check("other user can't read mine 404", r.status === 404, r.body);
    r = await call(S1, "PATCH", `/notification/${note.id}/read`);
    check("mark read", r.status === 200 && r.body.isRead === true, r.body);
    r = await call(S1, "POST", `/notification/${note.id}/click`);
    check("click returns href", r.status === 200 && r.body.href === "/courses", r.body);
    r = await call(A, "GET", `/admin/notifications/broadcasts/${sent.id}`);
    check("open + click tracked", r.body.stats.opened === 1 && r.body.stats.clicked === 1, r.body.stats);
    r = await call(S1, "PATCH", "/notification/read-all");
    r = await call(S1, "GET", "/notification/unread-count");
    check("read-all", r.body.count === 0, r.body);
    r = await call(S1, "GET", `/announcement/${course.id}`);
    check("course announcements", r.status === 200 && r.body.length === 1 && r.body[0].id === sent.id, r.body);
    r = await call(S1, "DELETE", `/notification/${note.id}`);
    check("delete own", r.status === 200, r.body);

    // ---- tenancy
    r = await call(A2, "GET", `/admin/notifications/broadcasts/${sent.id}`);
    check("other tenant 404", r.status === 404, r.body);
    r = await call(A2, "GET", "/admin/notifications/broadcasts");
    check("other tenant list empty", r.status === 200 && r.body.meta.total === 0, r.body);
    r = await call(A, "GET", "/admin/notifications/broadcasts/not-a-uuid");
    check("bad uuid 404", r.status === 404, r.body);

    // ---- scheduled + cancel, draft, duplicate
    const later = new Date(Date.now() + 30 * 60_000).toISOString();
    r = await call(A, "POST", "/admin/notifications/broadcasts", { ...base, audience: "ALL_STUDENTS", courseIds: [], channels: ["IN_APP"], timing: "SCHEDULE", scheduledAt: later });
    check("schedule 201", r.status === 201 && r.body.status === "SCHEDULED" && r.body.recipients === 3 && r.body.delivery === null, r.body);
    const sch = r.body;
    r = await call(A, "POST", `/admin/notifications/broadcasts/${sch.id}/cancel`);
    check("cancel", r.status === 200 && r.body.status === "CANCELLED", r.body);
    r = await call(A, "POST", `/admin/notifications/broadcasts/${sch.id}/cancel`);
    check("cancel twice 400", r.status === 400, r.body);
    r = await call(A, "POST", `/admin/notifications/broadcasts/${sch.id}/duplicate`);
    check("duplicate → draft", r.status === 201 && r.body.status === "DRAFT" && r.body.title.endsWith("(Copy)") && r.body.sendAt === null, r.body);
    const dup = r.body;
    r = await call(A, "POST", "/admin/notifications/broadcasts", { ...base, timing: "SCHEDULE", scheduledAt: "", asDraft: true });
    check("draft without time", r.status === 201 && r.body.status === "DRAFT", r.body);
    r = await call(A, "DELETE", `/admin/notifications/broadcasts/${dup.id}`);
    check("delete draft", r.status === 200, r.body);
    r = await call(A, "GET", "/admin/notifications/broadcasts?status=DRAFT");
    check("list filter", r.status === 200 && r.body.meta.total === 1, r.body);
    r = await call(A, "GET", "/admin/notifications/broadcasts/overview");
    check("overview", r.status === 200 && r.body.sentLast30 === 1 && r.body.drafts === 1 && r.body.reached === 2, r.body);

    // ---- scheduler (cron runs every minute): schedule, then move it into the past
    r = await call(A, "POST", "/admin/notifications/broadcasts", { ...base, title: "Scheduled one", channels: ["IN_APP"], timing: "SCHEDULE", scheduledAt: later });
    const due = r.body;
    await p.announcement.update({ where: { id: due.id }, data: { sendAt: new Date(Date.now() - 1000) } });
    let status = "SCHEDULED";
    for (let i = 0; i < 16 && status !== "SENT"; i++) { await sleep(5000); status = (await p.announcement.findUnique({ where: { id: due.id } })).status; }
    const dueNotes = await p.notification.count({ where: { broadcastId: due.id } });
    check("cron sent due broadcast", status === "SENT" && dueNotes === 2, { status, dueNotes });

    // ---- templates
    r = await call(A, "GET", "/admin/notifications/templates");
    check("templates seeded", r.status === 200 && r.body.length === 9 && r.body.some((t: any) => t.trigger === "PASSWORD_RESET" && t.locked), r.body);
    const quiz = r.body.find((t: any) => t.trigger === "QUIZ_RESULT"), reset = r.body.find((t: any) => t.trigger === "PASSWORD_RESET");
    r = await call(A, "PATCH", `/admin/notifications/templates/${quiz.id}`, { name: "Quiz result", subject: "{course_title}", body: "Hi {student_name}, you scored {score}", channels: ["IN_APP"], enabled: true });
    check("placeholder rule 400", r.status === 400 && msg(r).includes("{course_title} isn't available for this event"), r.body);
    r = await call(A, "PATCH", `/admin/notifications/templates/${quiz.id}`, { name: "Quiz result", subject: "Result: {quiz_title}", body: "Hi {student_name}, you scored {score}", channels: ["IN_APP", "EMAIL"], enabled: false });
    check("template update", r.status === 200 && r.body.subject === "Result: {quiz_title}" && r.body.enabled === false && r.body.channels.length === 2, r.body);
    r = await call(A, "PATCH", `/admin/notifications/templates/${reset.id}/enabled`, { enabled: false });
    check("locked can't be disabled 400", r.status === 400 && msg(r).includes("Security emails can't be turned off."), r.body);
    r = await call(A2, "GET", `/admin/notifications/templates/${quiz.id}`);
    check("template other tenant 404", r.status === 404, r.body);

    // ---- admin inbox (seed one for the admin)
    const adminNote = await p.notification.create({ data: { userId: admin.id, institutionId: inst.id, title: "New order", message: "ORD-1", type: "PAYMENT_RECEIPT", category: "PAYMENT", priority: "HIGH" } });
    r = await call(A, "GET", "/admin/notifications/inbox/stats");
    check("admin inbox stats", r.status === 200 && r.body.unread === 1 && r.body.highPriority === 1 && r.body.unreadByCategory.PAYMENT === 1, r.body);
    r = await call(A, "PATCH", "/admin/notifications/inbox/archive", { ids: [adminNote.id] });
    r = await call(A, "GET", "/admin/notifications/inbox?status=archived");
    check("archive", r.status === 200 && r.body.meta.total === 1 && r.body.data[0].isRead === true, r.body);
    r = await call(A, "PATCH", "/admin/notifications/inbox/read", { ids: ["bad"] });
    check("inbox ids validation 400", r.status === 400, r.body);
    r = await call(A, "GET", "/admin/notifications/stats");
    check("combined stats", r.status === 200 && r.body.templates.total === 9 && r.body.inbox.archived === 1, r.body);
  } catch (err) {
    bad++;
    console.log("FAIL crashed", err);
  } finally {
    await p.announcement.deleteMany({ where: { institutionId: { in: ids.institutions } } }); // deliveries cascade
    await p.notification.deleteMany({ where: { userId: { in: ids.users } } });
    await p.notificationTemplate.deleteMany({ where: { institutionId: { in: ids.institutions } } });
    if (ids.course) { await p.enrollment.deleteMany({ where: { courseId: ids.course } }); await p.courseModule.deleteMany({ where: { courseId: ids.course } }); await p.course.delete({ where: { id: ids.course } }); }
    if (ids.category) await p.category.delete({ where: { id: ids.category } });
    for (const t of ["teamEvent", "teamMember", "teamRole"]) await p[t].deleteMany({ where: { institutionId: { in: ids.institutions } } });
    await p.activityLog?.deleteMany?.({ where: { userId: { in: ids.users } } }).catch(() => {});
    await p.user.deleteMany({ where: { id: { in: ids.users } } });
    await p.institution.deleteMany({ where: { id: { in: ids.institutions } } });
    console.log(`\n${ok} passed, ${bad} failed`);
    await p.$disconnect();
  }
})();
