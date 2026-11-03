import { instantToLocal, localToInstant } from "../common/workspace-time";
import { EXPIRING_SOON_DAYS } from "./certificates.constants";
import { certificateStatus } from "./certificate-rules";
import type { CertificateListStats } from "./certificates.types";

/** Pure stats for the Certificates list (panel src/lib/certificateStats.ts). */

const DAY = 86_400_000;

export interface StatRow {
  id: string;
  courseId: string;
  templateId: string | null;
  issuedAt: Date;
  expiresAt: Date | null;
  status: string;
  method: string;
  downloads: number;
  verifications: number;
}

export function certificateListStats(certs: StatRow[], now: Date = new Date()): CertificateListStats {
  const t = now.getTime();
  const inWindow = (c: StatRow, from: number, to: number) => {
    const x = c.issuedAt.getTime();
    return x > from && x <= to;
  };
  const last30 = certs.filter((c) => inWindow(c, t - 30 * DAY, t)).length;
  const prev30 = certs.filter((c) => inWindow(c, t - 60 * DAY, t - 30 * DAY)).length;
  const statuses = certs.map((c) => certificateStatus(c, now));
  const expiringSoon = certs.filter((c, i) => statuses[i] === "VALID" && c.expiresAt && c.expiresAt.getTime() - t < EXPIRING_SOON_DAYS * DAY).length;
  return {
    total: certs.length,
    valid: statuses.filter((s) => s === "VALID").length,
    revoked: statuses.filter((s) => s === "REVOKED").length,
    expired: statuses.filter((s) => s === "EXPIRED").length,
    last30,
    last30Delta: prev30 ? Math.round(((last30 - prev30) / prev30) * 100) : null,
    expiringSoon,
    verifications: certs.reduce((s, c) => s + c.verifications, 0),
    downloads: certs.reduce((s, c) => s + c.downloads, 0),
    autoShare: certs.length ? Math.round((certs.filter((c) => c.method === "AUTO").length / certs.length) * 100) : 0,
  };
}

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Certificates issued per workspace-local month for the last `months` months (oldest first). */
export function monthlyIssued(certs: Pick<StatRow, "issuedAt">[], months = 6, now: Date = new Date()) {
  const [y, m] = instantToLocal(now).date.split("-").map(Number);
  return Array.from({ length: months }, (_, i) => {
    const idx = y * 12 + (m - 1) - (months - 1 - i);
    const year = Math.floor(idx / 12);
    const month = idx % 12;
    const key = `${year}-${String(month + 1).padStart(2, "0")}`;
    const start = localToInstant(`${key}-01`, "00:00")!.getTime();
    const nextIdx = idx + 1;
    const end = localToInstant(`${Math.floor(nextIdx / 12)}-${String((nextIdx % 12) + 1).padStart(2, "0")}-01`, "00:00")!.getTime();
    return { month: key, label: MONTH_LABELS[month], count: certs.filter((c) => c.issuedAt.getTime() >= start && c.issuedAt.getTime() < end).length };
  });
}

/** Issued count per course, busiest first. */
export function issuedByCourse(certs: Pick<StatRow, "courseId">[], titles: Map<string, string>) {
  const counts = new Map<string, number>();
  for (const c of certs) counts.set(c.courseId, (counts.get(c.courseId) ?? 0) + 1);
  return [...counts.entries()]
    .map(([courseId, count]) => ({ courseId, courseTitle: titles.get(courseId) ?? "Deleted course", count }))
    .sort((a, b) => b.count - a.count || a.courseTitle.localeCompare(b.courseTitle));
}

/** Per template: certificates issued + the latest issue moment. */
export function templateUsage(templateIds: string[], certs: Pick<StatRow, "templateId" | "issuedAt">[]) {
  return templateIds.map((templateId) => {
    const own = certs.filter((c) => c.templateId === templateId);
    const last = own.reduce<Date | null>((max, c) => (!max || c.issuedAt > max ? c.issuedAt : max), null);
    return { templateId, issued: own.length, lastIssuedAt: last ? last.toISOString() : null };
  });
}
