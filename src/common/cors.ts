import type { CorsOptions } from "@nestjs/common/interfaces/external/cors-options.interface";
import type { PrismaService } from "../prisma/prisma.service";
import { SAAS_ROOT_DOMAIN } from "../saas/saas.constants";
import { envList } from "./env";

const CACHE_MS = 5 * 60_000;

/**
 * CORS allowlist (instead of reflecting every origin with credentials):
 *  - FRONTEND_URL, CONSOLE_URL, WEBSITE_URL and CORS_ORIGINS (comma-separated), plus localhost:3000 / 3001 / 3002
 *    outside production (the marketing website calls checkout, contact and slug checks from the browser)
 *  - https://<slug>.edupro.com tenant subdomains
 *  - verified institution custom domains (from the DB, cached for 5 minutes)
 * Requests without an Origin header (server-to-server, curl, payment gateway callbacks) are allowed.
 */
export function buildCorsOptions(prisma: PrismaService, env: NodeJS.ProcessEnv = process.env): CorsOptions {
  const explicit = new Set(
    [
      ...envList(env.CORS_ORIGINS),
      env.FRONTEND_URL,
      env.CONSOLE_URL,
      env.WEBSITE_URL,
      ...(env.NODE_ENV === "production" ? [] : ["http://localhost:3000", "http://localhost:3001", "http://localhost:3002"]),
    ]
      .filter((o): o is string => !!o)
      .map((o) => o.replace(/\/$/, "")),
  );
  const rootDomain = env.SAAS_ROOT_DOMAIN || SAAS_ROOT_DOMAIN;
  const subdomain = new RegExp(`^https://[a-z0-9-]+\\.${rootDomain.replace(/\./g, "\\.")}$`);

  let verified: { hosts: Set<string>; at: number } = { hosts: new Set(), at: 0 };
  const verifiedDomains = async () => {
    if (Date.now() - verified.at < CACHE_MS) return verified.hosts;
    const rows = await prisma.customDomain.findMany({ where: { status: "VERIFIED" }, select: { domain: true } });
    verified = { hosts: new Set(rows.map((r) => r.domain)), at: Date.now() };
    return verified.hosts;
  };

  return {
    credentials: true,
    // Download endpoints (e.g. backups) name their file in Content-Disposition.
    exposedHeaders: ["Content-Disposition"],
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (explicit.has(origin) || subdomain.test(origin)) return callback(null, true);
      let host: string;
      try {
        const url = new URL(origin);
        if (url.protocol !== "https:") return callback(null, false);
        host = url.hostname;
      } catch {
        return callback(null, false);
      }
      verifiedDomains()
        .then((hosts) => callback(null, hosts.has(host)))
        .catch(() => callback(null, false));
    },
  };
}
