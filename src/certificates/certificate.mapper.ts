import type { Certificate, CertificateEvent as EventRow, CertificateTemplate as TemplateRow, Prisma } from "../../generated/prisma";
import { CERT_ACCENTS } from "./certificates.constants";
import type {
  CertificateAccent,
  CertificateEvent,
  CertificateSigner,
  CertificateTemplate,
  IssuedCertificate,
  TemplateFields,
} from "./certificates.types";

/** DB rows ⇄ panel shapes. Reads defensively so legacy rows (no template, no status columns yet set) still map. */

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const str = (v: unknown) => (typeof v === "string" ? v : "");

function signersOf(json: Prisma.JsonValue): CertificateSigner[] {
  if (!Array.isArray(json)) return [];
  return json
    .filter((s): s is Prisma.JsonObject => !!s && typeof s === "object" && !Array.isArray(s))
    .map((s, i) => ({ id: str(s.id) || `signer-${i + 1}`, name: str(s.name), title: str(s.title), signatureUrl: str(s.signatureUrl) }));
}

export function toTemplate(row: TemplateRow): CertificateTemplate {
  return {
    id: row.id,
    name: row.name,
    layout: row.layout,
    orientation: row.orientation,
    accent: (CERT_ACCENTS as readonly string[]).includes(row.accent) ? (row.accent as CertificateAccent) : "orange",
    heading: row.heading,
    bodyText: row.bodyText,
    showLogo: row.showLogo,
    showQr: row.showQr,
    showGrade: row.showGrade,
    signers: signersOf(row.signers),
    courseIds: row.courseIds ?? [],
    rules: {
      autoIssue: row.autoIssue,
      minCompletion: row.minCompletion,
      minQuizScore: row.minQuizScore,
      requireAssignments: row.requireAssignments,
      validityMonths: row.validityMonths,
    },
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Template fields → columns (create + update). */
export function toTemplateData(f: TemplateFields) {
  return {
    name: f.name,
    layout: f.layout,
    orientation: f.orientation,
    accent: f.accent,
    heading: f.heading,
    bodyText: f.bodyText,
    showLogo: f.showLogo,
    showQr: f.showQr,
    showGrade: f.showGrade,
    signers: f.signers.map((s) => ({ id: s.id, name: s.name, title: s.title, signatureUrl: s.signatureUrl })),
    courseIds: [...new Set(f.courseIds)],
    autoIssue: f.rules.autoIssue,
    minCompletion: f.rules.minCompletion,
    minQuizScore: f.rules.minQuizScore,
    requireAssignments: f.rules.requireAssignments,
    validityMonths: f.rules.validityMonths,
    status: f.status,
  } satisfies Prisma.CertificateTemplateUncheckedCreateInput;
}

export function fieldsOf(t: CertificateTemplate): TemplateFields {
  const { id: _id, createdAt: _c, updatedAt: _u, ...fields } = t;
  return structuredClone(fields);
}

export const issuedInclude = {
  user: { select: { id: true, name: true, email: true } },
  course: { select: { title: true } },
} satisfies Prisma.CertificateInclude;

export type IssuedRow = Certificate & { user: { id: string; name: string; email: string }; course: { title: string } | null };

export function toIssued(row: IssuedRow): IssuedCertificate {
  return {
    id: row.id,
    // Legacy rows: verificationCode was the public code (certificateNumber was internal).
    code: row.verificationCode || row.certificateNumber,
    templateId: row.templateId ?? "",
    courseId: row.courseId,
    courseTitle: row.course?.title ?? "",
    recipient: { id: row.user.id, name: row.user.name, email: row.user.email },
    grade: row.grade ?? null,
    completedAt: (row.completedAt ?? row.issuedAt).toISOString(),
    issuedAt: row.issuedAt.toISOString(),
    expiresAt: iso(row.expiresAt),
    method: row.method ?? "AUTO",
    status: row.status === "REVOKED" ? "REVOKED" : "VALID",
    revokedReason: row.revokedReason ?? "",
    revokedAt: iso(row.revokedAt),
    downloads: row.downloads ?? 0,
    verifications: row.verifications ?? 0,
    emailedAt: iso(row.emailedAt),
  };
}

export function toEvent(row: EventRow): CertificateEvent {
  return { id: row.id, certificateId: row.certificateId, kind: row.kind, message: row.message, actor: row.actorName, at: row.createdAt.toISOString() };
}
