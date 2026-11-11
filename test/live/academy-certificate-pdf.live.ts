/**
 * Live test for learner certificate PDFs: the API renders the signed-in learner's own certificate on demand
 * (A4 PDF, counts the download + logs a DOWNLOADED event), refuses other learners' certificates (404) and revoked
 * ones (403); the academy site's BFF (/api/me/certificates/:id/pdf on :3003) streams it with a filename.
 * Cleanup in `finally`.
 */
import { check, cleanup, mkInstitution, mkUser, newTag, prisma as p, report, retry, type Ids } from "./panel-e2e-helpers";

const API = process.env.LIVE_API_URL ?? "http://localhost:4077";
const SITE = process.env.LIVE_ACADEMY_URL ?? "http://localhost:3003";
const tag = newTag();
const ids: Ids = { users: [], insts: [] };

const learnerLogin = async (slug: string, email: string) =>
  (await (await fetch(`${API}/academy/public/${slug}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "Admin12345" }) })).json()) as { token: string; user: unknown };

(async () => {
  try {
    const inst = await mkInstitution(ids, `${tag}-c`);
    const teacher = await mkUser(ids, tag, "Cert Teacher", "TEACHER", inst.id);
    const learner = await mkUser(ids, tag, "Cert Learner", "STUDENT", inst.id);
    const other = await mkUser(ids, tag, "Other Learner", "STUDENT", inst.id);
    await p.user.updateMany({ where: { id: { in: [learner.id, other.id] } }, data: { emailVerified: true } });
    const cat = await p.category.create({ data: { name: "Dev", slug: `${tag}-dev`, status: "ACTIVE", institutionId: inst.id } });
    const course = await p.course.create({ data: { title: `${tag} Cert Course`, slug: `${tag}-cert`, description: "d", shortDescription: "s", categoryId: cat.id, instructorId: teacher.id, level: "Beginner", language: "English", price: 0, isFree: true, status: "PUBLISHED", durationMinutes: 30, institutionId: inst.id } });
    for (const u of [learner, other]) await p.enrollment.create({ data: { userId: u.id, courseId: course.id, status: "ACTIVE" } });
    const tpl = await p.certificateTemplate.create({ data: { institutionId: inst.id, name: "T", heading: "Certificate of Excellence", bodyText: "Awarded to {student_name} for {course_title} ({grade}).", accent: "green", showGrade: true, signers: [{ id: "s1", name: "Dr. Sign", title: "Director", signatureUrl: "" }], courseIds: [course.id], status: "ACTIVE" } });
    const cert = await p.certificate.create({ data: { userId: learner.id, courseId: course.id, certificateNumber: `${tag}-CERT`, certificateUrl: "", verificationCode: `${tag}V1`, institutionId: inst.id, templateId: tpl.id, grade: 88 } });
    const revoked = await p.certificate.create({ data: { userId: other.id, courseId: course.id, certificateNumber: `${tag}-CERT2`, certificateUrl: "", verificationCode: `${tag}V2`, institutionId: inst.id, status: "REVOKED" } });

    const mine = await learnerLogin(inst.slug, learner.email);
    const theirs = await learnerLogin(inst.slug, other.email);
    const url = (id: string) => `${API}/academy/${inst.slug}/me/certificates/${id}/pdf`;

    const r1 = await fetch(url(cert.id), { headers: { Authorization: `Bearer ${mine.token}` } });
    const buf = Buffer.from(await r1.arrayBuffer());
    check("own certificate → A4 PDF attachment", r1.status === 200 && r1.headers.get("content-type") === "application/pdf" && buf.subarray(0, 5).toString() === "%PDF-" && buf.length > 2000 && /attachment; filename=".+-certificate\.pdf"/.test(r1.headers.get("content-disposition") ?? ""), [r1.status, buf.length]);
    const after = await p.certificate.findUnique({ where: { id: cert.id } });
    const ev = await p.certificateEvent.findFirst({ where: { certificateId: cert.id, kind: "DOWNLOADED" } });
    check("download counted + DOWNLOADED event", after?.downloads === 1 && ev?.actorId === learner.id);

    const r2 = await fetch(url(cert.id), { headers: { Authorization: `Bearer ${theirs.token}` } });
    const r3 = await fetch(url(revoked.id), { headers: { Authorization: `Bearer ${theirs.token}` } });
    const r4 = await fetch(url(cert.id));
    check("another learner → 404; revoked → 403; signed out → 401", r2.status === 404 && r3.status === 403 && r4.status === 401, [r2.status, r3.status, r4.status]);

    // BFF on the academy site: session cookie from /api/auth/login, academy from the ?academy cookie.
    const pick = await fetch(`${SITE}/?academy=${inst.slug}`, { redirect: "manual" });
    const academyCookie = (pick.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
    const login = await fetch(`${SITE}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: academyCookie }, body: JSON.stringify({ email: learner.email, password: "Admin12345" }) });
    const cookies = [academyCookie, ...(login.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0])].join("; ");
    const r5 = await fetch(`${SITE}/api/me/certificates/${cert.id}/pdf`, { headers: { Cookie: cookies } });
    const b5 = Buffer.from(await r5.arrayBuffer());
    const r6 = await fetch(`${SITE}/api/me/certificates/${revoked.id}/pdf`, { headers: { Cookie: cookies } });
    const m6 = (await r6.json().catch(() => ({}))) as { message?: string };
    check("site BFF streams the PDF; other's cert → friendly 404", r5.status === 200 && b5.subarray(0, 5).toString() === "%PDF-" && r6.status === 404 && m6.message === "Certificate not found", [login.status, r5.status, r6.status, m6.message]);
  } catch (err) {
    check("suite crashed", false, (err as Error).stack);
  } finally {
    await cleanup(ids, tag, async (courses) => {
      await retry(() => p.certificate.deleteMany({ where: { courseId: { in: courses } } }));
      await retry(() => p.certificateTemplate.deleteMany({ where: { institutionId: { in: ids.insts } } }));
    });
    await report(tag);
  }
})();
