import { CERT_PLACEHOLDERS, REVOKE_REASON_LABEL, type REVOKE_REASONS } from "./certificates.constants";
import type { IssueRules, IssuedStatus, TemplateFields } from "./certificates.types";

/** Pure cross-field rules (the panel's superRefine blocks). Run on the merged entity for PATCH. */

/** templateFormSchema.superRefine — messages word for word. */
export function templateRuleErrors(v: Pick<TemplateFields, "bodyText" | "showGrade" | "status" | "courseIds">): string[] {
  const errors: string[] = [];
  if (!v.bodyText.includes("{student_name}")) errors.push("Include {student_name} so each certificate is personalised");
  const unknown = (v.bodyText.match(/\{[a-z_]+\}/g) ?? []).filter((p) => !(CERT_PLACEHOLDERS as readonly string[]).includes(p));
  if (unknown.length) errors.push(`Unknown placeholder: ${unknown[0]}`);
  if (v.bodyText.includes("{grade}") && !v.showGrade) errors.push("Turn on “Show grade” to use {grade}");
  if (v.status === "ACTIVE" && v.courseIds.length === 0) errors.push("Assign at least one course to activate this template");
  return errors;
}

/** revokeCertificateSchema.superRefine. */
export function revokeRuleErrors(reason: (typeof REVOKE_REASONS)[number], details: string): string[] {
  return reason === "OTHER" && details.trim().length < 5 ? ["Explain why (at least 5 characters)"] : [];
}

/** "Academic misconduct — details" (panel readableRevokeReason). */
export function revokeReasonText(reason: (typeof REVOKE_REASONS)[number], details: string) {
  const d = details.trim();
  const label = REVOKE_REASON_LABEL[reason] ?? "Other";
  return d ? `${label} — ${d}` : label;
}

/** Panel certificateStatus(): REVOKED wins, then EXPIRED once expiresAt has passed. */
export const certificateStatus = (c: { status: string; expiresAt: Date | string | null }, now: Date = new Date()): IssuedStatus =>
  c.status === "REVOKED" ? "REVOKED" : c.expiresAt && new Date(c.expiresAt).getTime() < now.getTime() ? "EXPIRED" : "VALID";

/** Same day-of-month `months` later (clamped to the month's last day). */
export function addMonths(from: Date, months: number): Date {
  const d = new Date(from.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}

/** "HTML & CSS Fundamentals" → "HCF" (initials of alphanumeric words, max 4; "EDU" when none). */
export function courseCode(title: string): string {
  const initials = title
    .split(/\s+/)
    .map((w) => w.replace(/[^A-Za-z0-9]/g, "")[0] ?? "")
    .join("")
    .toUpperCase()
    .slice(0, 4);
  return initials || "EDU";
}

/** "EDU-HCF-2026-" — every code of that course code + year shares it. */
export const codePrefix = (title: string, year: number) => `EDU-${courseCode(title)}-${year}-`;
export const formatCode = (prefix: string, seq: number) => `${prefix}${String(seq).padStart(5, "0")}`;
/** Next sequence after the highest existing code with this prefix. */
export function nextSequence(prefix: string, lastCode: string | null): number {
  if (!lastCode || !lastCode.startsWith(prefix)) return 1;
  const n = Number(lastCode.slice(prefix.length));
  return Number.isFinite(n) ? n + 1 : 1;
}

export interface LearnerProgress {
  completion: number;
  /** Average best quiz % across the course's published quizzes (null = the course has no quizzes). */
  quizScore: number | null;
  /** Every published assignment graded and passed (true when the course has none). */
  assignmentsPassed: boolean;
}

/** Does a learner satisfy a template's issue rules? */
export function meetsIssueRules(rules: Pick<IssueRules, "minCompletion" | "minQuizScore" | "requireAssignments">, p: LearnerProgress): boolean {
  if (p.completion < rules.minCompletion) return false;
  if (rules.minQuizScore !== null && p.quizScore !== null && p.quizScore < rules.minQuizScore) return false;
  if (rules.requireAssignments && !p.assignmentsPassed) return false;
  return true;
}

/** Average of the best % per quiz; quizzes without an attempt count as 0. null when there are no quizzes. */
export function averageQuizScore(quizIds: string[], best: Map<string, number>): number | null {
  if (!quizIds.length) return null;
  return Math.round(quizIds.reduce((s, id) => s + (best.get(id) ?? 0), 0) / quizIds.length);
}
