/**
 * API test of Settings › Maintenance in a tagged test workspace:
 *   Backups — Back up now (gzipped JSON with the workspace's courses / lessons / users; no password hashes,
 *   secrets or another workspace's data), cooldown, list, download, retention date, automatic-backup due rule
 *   (WorkspaceBackupsService.isDue), delete. The nightly job itself isn't run here (it covers every workspace).
 *   Maintenance mode — students and non-owner admins are refused (503, the admin's message) at sign-in and on
 *   requests, the owner always gets in, "allow admins" lets admins in, an end time in the past ends it.
 * API on :4077 by default (LIVE_API_URL). Cleanup in `finally`.
 */
import { gunzipSync } from "zlib";
import { WorkspaceBackupsService } from "../../src/workspace-settings/backups/workspace-backups.service";
import { check, cleanup, mkCourse, mkInstitution, mkUser, newTag, prisma as p, report, result, type Ids } from "./panel-e2e-helpers";

const API = process.env.LIVE_API_URL ?? "http://localhost:4077";
const tag = newTag();
async function api(token: string | null, method: string, path: string, body?: unknown) {
  const res = await fetch(`${API}${path}`, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const buf = Buffer.from(await res.arrayBuffer());
  let json: any = null;
  try {
    json = JSON.parse(buf.toString("utf8"));
  } catch {
    json = null;
  }
  return { status: res.status, body: json, raw: buf, headers: res.headers };
}
const login = (email: string) => api(null, "POST", "/auth/login", { email, password: "Admin12345" });
const msg = (r: { body: any }) => [r.body?.message].flat().join(" ");

(async () => {
  const ids: Ids = { users: [], insts: [] };
  try {
    const inst = await mkInstitution(ids, tag);
    const other = await mkInstitution(ids, `${tag}-other`);
    const owner = await mkUser(ids, tag, "Owner Admin", "ADMIN", inst.id);
    await new Promise((r) => setTimeout(r, 20));
    const admin2 = await mkUser(ids, tag, "Second Admin", "ADMIN", inst.id);
    const student = await mkUser(ids, tag, "Maint Student", "STUDENT", inst.id);
    const otherAdmin = await mkUser(ids, tag, "Other Admin", "ADMIN", other.id);
    const course = await mkCourse(inst.id, `Backup Course ${tag}`, owner.id);
    const mod = await p.courseModule.create({ data: { courseId: course.id, title: "Backup Module", order: 1 } });
    await p.lesson.create({ data: { courseId: course.id, moduleId: mod.id, title: `Backup Lesson ${tag}`, type: "TEXT", durationMinutes: 5, order: 1, status: "PUBLISHED", editorSettings: { seo: { title: `SEO ${tag}` } } } });
    await p.enrollment.create({ data: { userId: student.id, courseId: course.id, status: "ACTIVE" } });
    await mkCourse(other.id, `Foreign Course ${tag}`, otherAdmin.id);

    const t = (await login(owner.email)).body?.token as string;
    await api(t, "GET", "/team/me"); // bootstraps the team: the oldest admin is the owner

    // ---------------------------------------------------------------- backups
    const made = await api(t, "POST", "/admin/settings/backups");
    check("Back up now creates a backup", made.status === 201 && made.body?.kind === "MANUAL" && made.body?.rows > 0 && made.body?.createdByName === "Owner Admin", { s: made.status, b: made.body });
    const again = await api(t, "POST", "/admin/settings/backups");
    check("a second backup right away is refused (429)", again.status === 429, again.status);
    const list = await api(t, "GET", "/admin/settings/backups");
    check("list shows it", list.status === 200 && list.body?.length === 1 && list.body[0].id === made.body?.id, list.body);
    const days = (new Date(made.body.expiresAt).getTime() - new Date(made.body.createdAt).getTime()) / 864e5;
    check("kept for the retention days (default 30)", Math.round(days) === 30, days);

    const dl = await api(t, "GET", `/admin/settings/backups/${made.body.id}/download`);
    const file = JSON.parse(gunzipSync(dl.raw).toString("utf8"));
    const text = JSON.stringify(file);
    check("download is a gzipped JSON file with a name", dl.status === 200 && /attachment; filename="edupro-backup-.*\.json\.gz"/.test(dl.headers.get("content-disposition") ?? "") && file.format === "edupro-workspace-backup", dl.headers.get("content-disposition"));
    check(
      "backup has the workspace's data (course, lesson with editor settings, users, enrollment)",
      file.tables.Course?.some((c: any) => c.id === course.id) && file.tables.Lesson?.some((l: any) => l.editorSettings?.seo?.title === `SEO ${tag}`) && file.tables.User?.length >= 3 && file.tables.Enrollment?.length === 1 && file.tables.CourseModule?.length === 1,
      file.counts,
    );
    check("no password hashes, secrets or tokens", !text.includes("$2b$") && !/"password"|"twoFactorSecret"|"verificationToken"/.test(text) && file.removedFields.includes("User.password"), file.removedFields?.slice(0, 6));
    check("no other workspace's data", !text.includes(`Foreign Course ${tag}`) && !text.includes(other.id), "leak");

    const svc = new WorkspaceBackupsService(p);
    check("automatic backup is due when none was made", (await svc.isDue(inst.id)) === true);
    await svc.create(inst.id, "AUTO", "Automatic backup");
    check("…and not due again the same day", (await svc.isDue(inst.id)) === false);
    const otherList = await api((await login(otherAdmin.email)).body?.token, "GET", "/admin/settings/backups");
    check("another workspace doesn't see these backups", otherList.status === 200 && otherList.body?.length === 0, otherList.body?.length);
    const otherDl = await api((await login(otherAdmin.email)).body?.token, "GET", `/admin/settings/backups/${made.body.id}/download`);
    check("…nor download them (404)", otherDl.status === 404, otherDl.status);
    const del = await api(t, "DELETE", `/admin/settings/backups/${made.body.id}`);
    check("delete removes the backup", del.status === 204 && (await p.workspaceBackup.count({ where: { id: made.body.id } })) === 0, del.status);

    // ---------------------------------------------------------------- maintenance mode
    const store = await api(t, "GET", "/admin/settings");
    const base = store.body?.settings?.maintenance;
    const save = (patch: Record<string, unknown>) => api(t, "PATCH", "/admin/settings/maintenance", { ...base, ...patch });
    const message = `Back at 6 PM ${tag}`;
    const st = (await login(student.email)).body?.token as string;
    const a2 = (await login(admin2.email)).body?.token as string;
    const on = await save({ maintenanceMode: true, maintenanceMessage: message, maintenanceUntil: "", allowAdminsDuringMaintenance: false });
    check("owner turns maintenance mode on", on.status === 200, msg(on));
    const sLogin = await login(student.email);
    check("students can't sign in (503 with the message)", sLogin.status === 503 && sLogin.body?.code === "MAINTENANCE" && msg(sLogin) === message, { s: sLogin.status, m: msg(sLogin) });
    const sReq = await api(st, "GET", "/user/me");
    check("a signed-in student is refused too", sReq.status === 503, sReq.status);
    const a2Req = await api(a2, "GET", "/user/me");
    check("other admins are refused when admins aren't allowed", a2Req.status === 503, a2Req.status);
    const ownerReq = await api(t, "GET", "/admin/settings");
    const ownerLogin = await login(owner.email);
    check("the owner always gets in", ownerReq.status === 200 && ownerLogin.status === 201, { r: ownerReq.status, l: ownerLogin.status });
    await save({ maintenanceMode: true, maintenanceMessage: message, maintenanceUntil: "", allowAdminsDuringMaintenance: true });
    const a2Allowed = await api(a2, "GET", "/user/me");
    check("'allow admins' lets admins in", a2Allowed.status === 200, a2Allowed.status);
    await save({ maintenanceMode: true, maintenanceMessage: message, maintenanceUntil: "2020-01-01T00:00:00Z", allowAdminsDuringMaintenance: false });
    const ended = await login(student.email);
    check("an end time in the past ends maintenance", ended.status === 201, { s: ended.status, m: msg(ended) });
    await save({ maintenanceMode: false, maintenanceUntil: "" });
  } catch (e) {
    console.log("FAIL exception", (e as Error).message || String(e).slice(0, 400));
    result.bad++;
  } finally {
    await cleanup(ids, tag, async () => {
      await p.workspaceBackup.deleteMany({ where: { institutionId: { in: ids.insts } } });
      await p.workspaceSettings.deleteMany({ where: { institutionId: { in: ids.insts } } });
    });
    await report(tag, `, (select count(*)::int from workspace_backups where "institutionId" in (${ids.insts.map((i) => `'${i}'`).join(",") || "''"})) backups`);
  }
})();
