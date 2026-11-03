/**
 * Response shapes for the admin panel's Certificates pages — they mirror `lms-admin-panel/src/types/certificate.ts`
 * field for field, so the panel can swap its localStorage mock for these endpoints without mapping.
 */

export type CertificateLayout = "CLASSIC" | "MODERN" | "MINIMAL";
export type CertificateOrientation = "LANDSCAPE" | "PORTRAIT";
export type CertificateAccent = "orange" | "blue" | "green" | "purple" | "navy";
export type TemplateStatus = "ACTIVE" | "DRAFT" | "ARCHIVED";
export type IssuedStatus = "VALID" | "REVOKED" | "EXPIRED";
export type IssueMethod = "AUTO" | "MANUAL";
export type CertificateEventKind = "ISSUED" | "EMAILED" | "DOWNLOADED" | "VERIFIED" | "REVOKED" | "RESTORED" | "REISSUED";

export interface CertificateSigner {
  id: string;
  name: string;
  title: string;
  /** Hosted signature image ("" = typed signature). */
  signatureUrl: string;
}

export interface IssueRules {
  autoIssue: boolean;
  minCompletion: number;
  minQuizScore: number | null;
  requireAssignments: boolean;
  validityMonths: number | null;
}

/** Everything the template designer owns (= panel `TemplateFormValues`). */
export interface TemplateFields {
  name: string;
  layout: CertificateLayout;
  orientation: CertificateOrientation;
  accent: CertificateAccent;
  heading: string;
  bodyText: string;
  showLogo: boolean;
  showQr: boolean;
  showGrade: boolean;
  signers: CertificateSigner[];
  courseIds: string[];
  rules: IssueRules;
  status: TemplateStatus;
}

export interface CertificateTemplate extends TemplateFields {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface CertificateRecipient {
  id: string;
  name: string;
  email: string;
}

export interface IssuedCertificate {
  id: string;
  code: string;
  /** "" on legacy rows without a template. */
  templateId: string;
  courseId: string;
  /** Extra (not in the panel type): saves the panel a course lookup. */
  courseTitle: string;
  recipient: CertificateRecipient;
  grade: number | null;
  completedAt: string;
  issuedAt: string;
  expiresAt: string | null;
  method: IssueMethod;
  /** Stored status; EXPIRED is derived client-side (certificateStatus()). */
  status: "VALID" | "REVOKED";
  revokedReason: string;
  revokedAt: string | null;
  downloads: number;
  verifications: number;
  emailedAt: string | null;
}

export interface CertificateEvent {
  id: string;
  certificateId: string;
  kind: CertificateEventKind;
  message: string;
  actor: string;
  at: string;
}

/** Recent-activity row (event + what the card links to). */
export interface CertificateActivity extends CertificateEvent {
  code: string;
  recipientName: string;
}

export interface EligibleLearner {
  recipient: CertificateRecipient;
  courseId: string;
  completion: number;
  quizScore: number | null;
  completedAt: string;
}

export interface CertificateDetail {
  certificate: IssuedCertificate;
  template: CertificateTemplate | null;
  events: CertificateEvent[];
}

export interface CertificateListStats {
  total: number;
  valid: number;
  revoked: number;
  expired: number;
  last30: number;
  last30Delta: number | null;
  expiringSoon: number;
  verifications: number;
  downloads: number;
  autoShare: number;
}

export interface CertificateOverview extends CertificateListStats {
  /** Last 6 workspace-local months, oldest first. */
  monthly: { month: string; label: string; count: number }[];
  byCourse: { courseId: string; courseTitle: string; count: number }[];
  templateUsage: { templateId: string; issued: number; lastIssuedAt: string | null }[];
  counts: { templates: number; eligible: number };
}
