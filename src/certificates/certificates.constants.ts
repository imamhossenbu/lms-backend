/** Enum values + limits shared by the DTOs, rules and mapper (copied from the panel's zod schemas). */

export const CERT_LAYOUTS = ["CLASSIC", "MODERN", "MINIMAL"] as const;
export const CERT_ORIENTATIONS = ["LANDSCAPE", "PORTRAIT"] as const;
export const CERT_ACCENTS = ["orange", "blue", "green", "purple", "navy"] as const;
export const TEMPLATE_STATUSES = ["ACTIVE", "DRAFT", "ARCHIVED"] as const;
export const ISSUED_STATUSES = ["VALID", "REVOKED", "EXPIRED"] as const;
export const ISSUE_METHODS = ["AUTO", "MANUAL"] as const;
export const REVOKE_REASONS = ["ACADEMIC_MISCONDUCT", "ISSUED_IN_ERROR", "REFUND", "OTHER"] as const;

/** Panel `REVOKE_REASON_LABEL` (detail page) — the stored revokedReason is "Label — details". */
export const REVOKE_REASON_LABEL: Record<(typeof REVOKE_REASONS)[number], string> = {
  ACADEMIC_MISCONDUCT: "Academic misconduct",
  ISSUED_IN_ERROR: "Issued in error",
  REFUND: "Refund",
  OTHER: "Other",
};

export const CERT_PLACEHOLDERS = ["{student_name}", "{course_title}", "{completion_date}", "{grade}", "{instructor_name}", "{certificate_id}"] as const;

export const CERT_LIMITS = {
  nameMin: 3,
  nameMax: 80,
  headingMin: 3,
  headingMax: 60,
  bodyMin: 20,
  bodyMax: 400,
  signerMin: 2,
  signerMax: 60,
  maxSigners: 3,
  maxCourses: 200,
  noteMax: 200,
  detailsMax: 300,
  validityMax: 120,
  bulkMax: 200,
} as const;

export const TEMPLATE_COPY_SUFFIX = " (Copy)";
/** Valid certificates expiring within this window count as "expiring soon". */
export const EXPIRING_SOON_DAYS = 30;
/** Public verification page; the code is appended. */
export const VERIFY_BASE_URL = (process.env.CERTIFICATE_VERIFY_URL ?? "https://edupro.com/verify").replace(/\/+$/, "");
export const verifyUrl = (code: string) => `${VERIFY_BASE_URL}/${code}`;
