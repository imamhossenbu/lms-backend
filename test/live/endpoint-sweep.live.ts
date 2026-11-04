/**
 * Endpoint sweep: every route from the OpenAPI document is called as anonymous, workspace admin and student,
 * with non-existent ids and an empty body. Expectation: NEVER a 5xx; parameterless admin GETs return 2xx.
 * Runs inside an isolated "pro" workspace. Server on :4077 (Swagger on). Cleanup in `finally`.
 */
import "dotenv/config";
import { JwtService } from "@nestjs/jwt";
import { randomUUID } from "crypto";
import { PrismaService } from "../../src/prisma/prisma.service";

const BASE = process.env.LIVE_API_URL ?? "http://localhost:4077";
const p: any = new PrismaService();
const jwt = new JwtService({ secret: process.env.SUPER_SECRET_KEY });
const tag = `sweep-${Date.now()}`;

/** Routes with real side effects across ALL workspaces, or real money / LLM calls — not swept blindly. */
const SKIP = new Set(["POST /saas/owner/lifecycle/run", "POST /payments/initiate"]);
/** Parameterless GETs that legitimately need query input. */
const NEEDS_QUERY = new Set(["/saas/public/slug-availability", "/saas/owner/institutions/slug-availability", "/admin/community/similar", "/admin/notifications/broadcasts/estimate", "/team/invitations/accept", "/auth/verify", "/admin/certificates/learners"]);

(async () => {
  const ids: any = { users: [] as string[], inst: null as string | null };
  const fivexx: string[] = [];
  const adminGetFails: string[] = [];
  let calls = 0;
  try {
    const spec = await (await fetch(`${BASE}/api/docs-json`)).json();
    const plan = await p.saasPlan.findFirst({ where: { id: "pro" } });
    const inst = await p.institution.create({ data: { name: "Sweep", slug: tag, logoInitials: "SW", type: "SCHOOL", country: "Bangladesh", ownerName: "S", ownerEmail: `${tag}@example.com`, planId: plan.id, status: "ACTIVE", currentPeriodStart: new Date(), currentPeriodEnd: new Date(Date.now() + 30 * 864e5) } });
    ids.inst = inst.id;
    const mk = async (n: string, role: string) => {
      const u = await p.user.create({ data: { name: `Sweep ${n}`, email: `${tag}-${n}@example.com`, password: "x", role, status: "ACTIVE", emailVerified: true, institutionId: inst.id } });
      ids.users.push(u.id);
      return jwt.sign({ sub: u.id, email: u.email, role, institutionId: inst.id }, { expiresIn: "30m" });
    };
    const admin = await mk("admin", "ADMIN");
    const student = await mk("student", "STUDENT");
    await fetch(`${BASE}/team/me`, { headers: { authorization: `Bearer ${admin}` } }); // bootstrap → owner
    const tokens: Record<string, string | null> = { anon: null, admin, student };

    const routes: { method: string; path: string }[] = [];
    for (const [path, ops] of Object.entries<any>(spec.paths)) for (const m of Object.keys(ops)) routes.push({ method: m.toUpperCase(), path });

    for (const { method, path } of routes) {
      if (SKIP.has(`${method} ${path}`)) continue;
      const url = path.replace(/\{[^}]+\}/g, () => randomUUID());
      for (const [who, token] of Object.entries(tokens)) {
        const r = await fetch(BASE + url, {
          method,
          headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" },
          body: method === "GET" || method === "DELETE" ? undefined : "{}",
        });
        calls++;
        if (r.status >= 500) fivexx.push(`${r.status} ${method} ${path} as ${who} → ${(await r.text()).slice(0, 160)}`);
        const adminArea = /^\/(admin|students|instructors|team|saas\/me)(\/|$)/.test(path);
        if (who === "admin" && method === "GET" && !path.includes("{") && adminArea && !NEEDS_QUERY.has(path) && (r.status < 200 || r.status >= 300))
          adminGetFails.push(`${r.status} GET ${path} → ${(await r.text()).slice(0, 160)}`);
      }
    }
  } catch (e) {
    console.log("FAIL exception", e);
  } finally {
    if (ids.inst) {
      for (const t of ["teamEvent", "teamMember", "teamRole"]) await p[t].deleteMany({ where: { institutionId: ids.inst } });
      await p.workspaceSettings.deleteMany({ where: { institutionId: ids.inst } }).catch(() => {});
      await p.notification.deleteMany({ where: { userId: { in: ids.users } } }).catch(() => {});
      await p.activityLog.deleteMany({ where: { userId: { in: ids.users } } });
      await p.user.deleteMany({ where: { id: { in: ids.users } } });
      await p.institution.deleteMany({ where: { id: ids.inst } });
    }
    console.log(`calls: ${calls}`);
    console.log(`5xx: ${fivexx.length}`);
    fivexx.forEach((l) => console.log("  " + l));
    console.log(`admin list GETs not 2xx: ${adminGetFails.length}`);
    adminGetFails.forEach((l) => console.log("  " + l));
    await p.$disconnect();
  }
})();
