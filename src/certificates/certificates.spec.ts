import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { certificateListStats, issuedByCourse, monthlyIssued, templateUsage, type StatRow } from "./certificate-insights";
import {
  addMonths,
  averageQuizScore,
  certificateStatus,
  codePrefix,
  courseCode,
  formatCode,
  meetsIssueRules,
  nextSequence,
  revokeReasonText,
  revokeRuleErrors,
  templateRuleErrors,
} from "./certificate-rules";
import { fieldsOf, toIssued, toTemplate, toTemplateData } from "./certificate.mapper";
import type { TemplateFields } from "./certificates.types";
import { IssueCertificateDto, IssuedFilterDto, RevokeCertificateDto } from "./dto/certificate.dto";
import { CreateTemplateDto, UpdateTemplateDto } from "./dto/template.dto";

const messages = (cls: any, body: object) =>
  validateSync(plainToInstance(cls, body), { whitelist: true }).flatMap(function flat(e): string[] {
    return [...Object.values(e.constraints ?? {}), ...(e.children ?? []).flatMap(flat)];
  });

const COURSE = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";

const fields = (over: Partial<TemplateFields> = {}): TemplateFields => ({
  name: "Classic Completion",
  layout: "CLASSIC",
  orientation: "LANDSCAPE",
  accent: "orange",
  heading: "Certificate of Completion",
  bodyText: "This is to certify that {student_name} has successfully completed {course_title} on {completion_date}.",
  showLogo: true,
  showQr: true,
  showGrade: false,
  signers: [{ id: "signer-1", name: "Arif Hossain", title: "Lead Instructor", signatureUrl: "" }],
  courseIds: [COURSE],
  rules: { autoIssue: true, minCompletion: 100, minQuizScore: 60, requireAssignments: true, validityMonths: null },
  status: "ACTIVE",
  ...over,
});

const templateRow = (f: TemplateFields) => ({
  id: "t1",
  institutionId: null,
  ...toTemplateData(f),
  createdAt: new Date("2026-10-01T00:00:00Z"),
  updatedAt: new Date("2026-10-02T00:00:00Z"),
});

describe("template DTO (panel templateFormSchema messages)", () => {
  it("accepts a valid template", () => {
    expect(messages(CreateTemplateDto, fields())).toEqual([]);
  });

  it("copies the panel's messages", () => {
    const m = messages(CreateTemplateDto, {
      ...fields(),
      name: " ab ",
      heading: "x",
      bodyText: "too short",
      signers: [],
      rules: { autoIssue: false, minCompletion: 0, minQuizScore: 1.5, requireAssignments: false, validityMonths: 200 },
    });
    expect(m).toEqual(
      expect.arrayContaining([
        "Template name must be at least 3 characters",
        "Heading is required",
        "Write at least 20 characters",
        "Add at least one signer",
        "At least 1%",
        "Whole numbers only",
        "Up to 120 months",
      ]),
    );
  });

  it("validates signers and caps them at 3", () => {
    const s = { id: "s", name: "A", title: "B", signatureUrl: "javascript:alert(1)" };
    const m = messages(CreateTemplateDto, { ...fields(), signers: [s, s, s, s] });
    expect(m).toEqual(expect.arrayContaining(["Up to 3 signers", "Signer name is required", "Signer title is required", "Signature must be an uploaded image URL"]));
  });

  it("strips tags from plain-text fields", () => {
    const dto = plainToInstance(CreateTemplateDto, { ...fields(), heading: "<b>Certificate</b> of Merit<script>x</script>" });
    expect(dto.heading).toBe("Certificate of Meritx");
  });

  it("PATCH accepts any subset", () => {
    expect(messages(UpdateTemplateDto, { status: "ARCHIVED" })).toEqual([]);
    expect(messages(UpdateTemplateDto, { name: "ab" })).toEqual(["Template name must be at least 3 characters"]);
  });
});

describe("templateRuleErrors (superRefine)", () => {
  it("passes a valid template", () => expect(templateRuleErrors(fields())).toEqual([]));
  it("requires {student_name}", () =>
    expect(templateRuleErrors(fields({ bodyText: "Awarded for completing {course_title} with distinction." }))).toEqual([
      "Include {student_name} so each certificate is personalised",
    ]));
  it("rejects unknown placeholders", () =>
    expect(templateRuleErrors(fields({ bodyText: "{student_name} finished {course_name} today, well done." }))).toEqual(["Unknown placeholder: {course_name}"]));
  it("needs Show grade for {grade}", () =>
    expect(templateRuleErrors(fields({ bodyText: "{student_name} scored {grade} in {course_title}." }))).toEqual(["Turn on “Show grade” to use {grade}"]));
  it("needs a course to be ACTIVE", () =>
    expect(templateRuleErrors(fields({ courseIds: [] }))).toEqual(["Assign at least one course to activate this template"]));
  it("drafts may have no courses", () => expect(templateRuleErrors(fields({ courseIds: [], status: "DRAFT" }))).toEqual([]));
});

describe("issue + revoke DTOs", () => {
  it("issue messages", () => {
    const m = messages(IssueCertificateDto, { courseId: "", recipientId: "x", grade: 101, completedAt: "", sendEmail: true, note: "n".repeat(201) });
    expect(m).toEqual(expect.arrayContaining(["Select a course", "Select a learner", "100 or less", "Pick the completion date", "200 characters or less"]));
  });
  it("issue defaults", () => {
    const dto = plainToInstance(IssueCertificateDto, { courseId: COURSE, recipientId: USER, completedAt: "2026-11-01" });
    expect(messages(IssueCertificateDto, dto)).toEqual([]);
    expect(dto.grade).toBeNull();
    expect(dto.sendEmail).toBe(false);
    expect(dto.note).toBe("");
  });
  it("revoke messages + OTHER rule", () => {
    expect(messages(RevokeCertificateDto, { reason: "OTHER", details: "x".repeat(301), notifyLearner: false })).toEqual(["300 characters or less"]);
    expect(revokeRuleErrors("OTHER", " abc ")).toEqual(["Explain why (at least 5 characters)"]);
    expect(revokeRuleErrors("REFUND", "")).toEqual([]);
    expect(revokeReasonText("ACADEMIC_MISCONDUCT", " copied ")).toBe("Academic misconduct — copied");
    expect(revokeReasonText("REFUND", "")).toBe("Refund");
  });
  it("list filters treat the panel's 'All' as no filter", () => {
    const dto = plainToInstance(IssuedFilterDto, { courseId: "All", status: "EXPIRED", method: "All", page: "2" });
    expect(messages(IssuedFilterDto, dto)).toEqual([]);
    expect(dto.courseId).toBeUndefined();
    expect(dto.page).toBe(2);
  });
});

describe("mapper", () => {
  it("template round-trips", () => {
    const f = fields({ signers: [{ id: "a", name: "Nadia Karim", title: "Head of Academics", signatureUrl: "https://cdn.example.com/s.png" }] });
    const t = toTemplate(templateRow(f) as any);
    expect(fieldsOf(t)).toEqual(f);
    expect(t.createdAt).toBe("2026-10-01T00:00:00.000Z");
  });

  it("maps legacy certificate rows defensively", () => {
    const issuedAt = new Date("2025-03-01T10:00:00Z");
    const c = toIssued({
      id: "c1",
      userId: USER,
      courseId: COURSE,
      certificateNumber: "CERT-1700000000",
      certificateUrl: "https://res.cloudinary.com/x.pdf",
      verificationCode: "AB12CD34",
      issuedAt,
      institutionId: null,
      templateId: null,
      grade: null,
      completedAt: null,
      expiresAt: null,
      method: "AUTO",
      status: "VALID",
      revokedReason: "",
      revokedAt: null,
      downloads: 0,
      verifications: 0,
      emailedAt: null,
      user: { id: USER, name: "Sarah Rahman", email: "sarah@example.com" },
      course: { title: "HTML & CSS" },
    } as any);
    expect(c).toMatchObject({ code: "AB12CD34", templateId: "", completedAt: issuedAt.toISOString(), expiresAt: null, status: "VALID", courseTitle: "HTML & CSS" });
  });
});

describe("rules helpers", () => {
  const now = new Date("2026-11-03T00:00:00Z");
  it("derives status", () => {
    expect(certificateStatus({ status: "REVOKED", expiresAt: null }, now)).toBe("REVOKED");
    expect(certificateStatus({ status: "VALID", expiresAt: "2026-11-02T00:00:00Z" }, now)).toBe("EXPIRED");
    expect(certificateStatus({ status: "VALID", expiresAt: null }, now)).toBe("VALID");
  });
  it("adds months with clamping", () => {
    expect(addMonths(new Date("2026-01-31T05:00:00Z"), 1).toISOString()).toBe("2026-02-28T05:00:00.000Z");
    expect(addMonths(new Date("2026-11-03T00:00:00Z"), 24).toISOString()).toBe("2028-11-03T00:00:00.000Z");
  });
  it("builds codes", () => {
    expect(courseCode("HTML & CSS Fundamentals")).toBe("HCF");
    expect(courseCode("   ")).toBe("EDU");
    const p = codePrefix("JavaScript Essentials", 2026);
    expect(p).toBe("EDU-JE-2026-");
    expect(nextSequence(p, null)).toBe(1);
    expect(nextSequence(p, "EDU-JE-2026-00041")).toBe(42);
    expect(formatCode(p, 42)).toBe("EDU-JE-2026-00042");
  });
  it("checks issue rules", () => {
    const rules = { minCompletion: 100, minQuizScore: 60, requireAssignments: true };
    expect(meetsIssueRules(rules, { completion: 100, quizScore: 70, assignmentsPassed: true })).toBe(true);
    expect(meetsIssueRules(rules, { completion: 90, quizScore: 70, assignmentsPassed: true })).toBe(false);
    expect(meetsIssueRules(rules, { completion: 100, quizScore: 50, assignmentsPassed: true })).toBe(false);
    expect(meetsIssueRules(rules, { completion: 100, quizScore: null, assignmentsPassed: true })).toBe(true);
    expect(meetsIssueRules(rules, { completion: 100, quizScore: 90, assignmentsPassed: false })).toBe(false);
  });
  it("averages best quiz scores (missing = 0)", () => {
    expect(averageQuizScore([], new Map())).toBeNull();
    expect(averageQuizScore(["a", "b"], new Map([["a", 90]]))).toBe(45);
  });
});

describe("insights (panel certificateStats)", () => {
  const now = new Date("2026-11-03T06:00:00Z");
  const day = 86_400_000;
  const row = (over: Partial<StatRow>): StatRow => ({
    id: Math.random().toString(36),
    courseId: "c1",
    templateId: "t1",
    issuedAt: new Date(now.getTime() - day),
    expiresAt: null,
    status: "VALID",
    method: "AUTO",
    downloads: 1,
    verifications: 2,
    ...over,
  });
  const certs = [
    row({}),
    row({ method: "MANUAL", status: "REVOKED" }),
    row({ issuedAt: new Date(now.getTime() - 40 * day), expiresAt: new Date(now.getTime() - day) }),
    row({ issuedAt: new Date(now.getTime() - 45 * day), expiresAt: new Date(now.getTime() + 10 * day), courseId: "c2", templateId: "t2" }),
  ];

  it("computes the stat cards", () => {
    expect(certificateListStats(certs, now)).toEqual({
      total: 4,
      valid: 2,
      revoked: 1,
      expired: 1,
      last30: 2,
      last30Delta: 0,
      expiringSoon: 1,
      verifications: 8,
      downloads: 4,
      autoShare: 75,
    });
    expect(certificateListStats([], now).autoShare).toBe(0);
  });

  it("buckets by workspace-local month", () => {
    const m = monthlyIssued(certs, 6, now);
    expect(m.map((x) => x.month)).toEqual(["2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"]);
    expect(m[5]).toEqual({ month: "2026-11", label: "Nov", count: 2 });
    expect(m.reduce((s, x) => s + x.count, 0)).toBe(4);
  });

  it("counts by course and template", () => {
    expect(issuedByCourse(certs, new Map([["c1", "HTML"], ["c2", "CSS"]]))).toEqual([
      { courseId: "c1", courseTitle: "HTML", count: 3 },
      { courseId: "c2", courseTitle: "CSS", count: 1 },
    ]);
    const u = templateUsage(["t1", "t2", "t3"], certs);
    expect(u[0]).toEqual({ templateId: "t1", issued: 3, lastIssuedAt: new Date(now.getTime() - day).toISOString() });
    expect(u[2]).toEqual({ templateId: "t3", issued: 0, lastIssuedAt: null });
  });
});
