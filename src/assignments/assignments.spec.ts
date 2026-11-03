import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { gradeDistribution, submissionCounts } from "./assignment-insights";
import { assignmentRuleErrors, gradeErrors } from "./assignment-rules";
import { instantToLocal, localToInstant } from "./assignment-schedule";
import { attemptsToColumn, fileTypesFromColumn, fileTypesToColumn, toAssignmentData, toAssignmentItem } from "./assignment.mapper";
import type { AssignmentFields, AssignmentSubmission } from "./assignments.types";
import { CreateAssignmentDto, UpdateAssignmentDto } from "./dto/assignment.dto";
import { submissionProblem } from "./submission-gate";

const messages = (cls: any, body: object) =>
  validateSync(plainToInstance(cls, body), { whitelist: true }).flatMap(function flat(e): string[] {
    return [...Object.values(e.constraints ?? {}), ...(e.children ?? []).flatMap(flat)];
  });

const COURSE = "11111111-1111-4111-8111-111111111111";
const MODULE = "22222222-2222-4222-8222-222222222222";

const level = (id: string, tone: string, points: number) => ({ id, tone, label: tone === "EXCELLENT" ? "Excellent" : "Good", points, description: "Level text" });
const fields = (over: Partial<AssignmentFields> = {}): AssignmentFields => ({
  courseId: COURSE,
  title: "Build a landing page",
  descriptionHtml: "<p>Build a responsive landing page.</p>",
  moduleId: MODULE,
  lessonId: "",
  type: "FILE_UPLOAD",
  dueDate: "2026-11-20",
  dueTime: "23:59",
  totalPoints: 30,
  attempts: "UNLIMITED",
  lateSubmission: "ALLOW",
  gradingType: "POINTS",
  showRubric: true,
  peerReview: false,
  attachments: [],
  instructions: { overview: "", objectives: [], tasks: [], requirements: [], allowedFileTypes: [".zip", ".pdf"], maxFileSizeMb: 50, gradingNotes: [] },
  rubric: {
    enabled: true,
    title: "Landing page rubric",
    totalPoints: 30,
    description: "",
    visibleToStudents: true,
    criteria: [
      { id: "c1", title: "Layout", description: "Layout works", points: 20, levels: [level("c1-ex", "EXCELLENT", 20), level("c1-gd", "GOOD", 12)] as any },
      { id: "c2", title: "Code", description: "Clean code", points: 10, levels: [level("c2-ex", "EXCELLENT", 10), level("c2-gd", "GOOD", 6)] as any },
    ],
  },
  category: "Project",
  difficulty: "BEGINNER",
  estimatedTime: 2,
  estimatedUnit: "HOURS",
  instructionsHtml: "<p>Follow the design file and ship a working page.</p>",
  maxFiles: 1,
  latePenalty: 0,
  latePenaltyUnit: "PERCENT",
  passingScore: 18,
  gradeDisplay: "EXACT",
  aiGrading: { enabled: false, criteria: "" },
  manualOverride: true,
  releaseDate: "2026-11-01",
  releaseTime: "09:00",
  availability: "UNTIL_DUE",
  timeLimitMinutes: 60,
  windowStartDate: "",
  windowStartTime: "",
  windowEndDate: "",
  windowEndTime: "",
  showInCalendar: true,
  ...over,
});

describe("assignment schedule (workspace time, UTC+6)", () => {
  it("round-trips local date + time", () => {
    const at = localToInstant("2026-11-20", "23:59")!;
    expect(at.toISOString()).toBe("2026-11-20T17:59:00.000Z");
    expect(instantToLocal(at)).toEqual({ date: "2026-11-20", time: "23:59" });
    expect(instantToLocal(new Date("2026-11-20T19:00:00Z"))).toEqual({ date: "2026-11-21", time: "01:00" });
    expect(localToInstant("", "")).toBeNull();
  });
});

describe("assignment mapper", () => {
  it("converts legacy file-type CSV and attempts", () => {
    expect(fileTypesFromColumn("pdf, ZIP,.rar")).toEqual([".pdf", ".zip", ".rar"]);
    expect(fileTypesToColumn([".pdf", ".zip"])).toBe("pdf,zip");
    expect(attemptsToColumn("UNLIMITED")).toBeNull();
    expect(attemptsToColumn("3")).toBe(3);
  });

  it("round-trips the panel shape through the columns", () => {
    const f = fields();
    const data = toAssignmentData(f) as any;
    const now = new Date("2026-11-03T00:00:00Z");
    const item = toAssignmentItem({ ...data, id: "a1", institutionId: null, status: "PUBLISHED", createdAt: now, updatedAt: now }, 32);
    expect(item.dueDate).toBe("2026-11-20");
    expect(item.dueTime).toBe("23:59");
    expect(item.instructions.allowedFileTypes).toEqual([".zip", ".pdf"]);
    expect(item.rubric.criteria).toHaveLength(2);
    expect(item.rubric.totalPoints).toBe(30);
    expect(item.attempts).toBe("UNLIMITED");
    expect(item.enrolledCount).toBe(32);
  });

  it("strips unsafe HTML", () => {
    const data = toAssignmentData(fields({ descriptionHtml: '<p onclick="x()">Hi</p><script>alert(1)</script>' }));
    expect(data.description).toBe("<p>Hi</p>");
  });
});

describe("assignment rules", () => {
  it("accepts a consistent assignment", () => {
    expect(assignmentRuleErrors(fields())).toEqual([]);
  });

  it("checks rubric totals, penalties, schedule and windows", () => {
    expect(assignmentRuleErrors(fields({ totalPoints: 40 }))).toContain("Criteria add up to 30 points — they must equal the total points (40)");
    expect(assignmentRuleErrors(fields({ lateSubmission: "ALLOW_WITH_PENALTY", latePenalty: 0 }))).toContain("Enter a penalty greater than 0");
    expect(assignmentRuleErrors(fields({ dueDate: "2026-10-01" }))).toContain("Due date must be after the release date");
    expect(assignmentRuleErrors(fields({ availability: "WINDOW" }))).toEqual(["Pick the window start", "Pick the window end"]);
    expect(assignmentRuleErrors(fields({ passingScore: 31 }))).toContain("Passing score can't exceed 30");
    expect(assignmentRuleErrors(fields({ type: "FILE_UPLOAD", instructions: { ...fields().instructions, allowedFileTypes: [] } }))).toContain(
      "Allow at least one file type",
    );
  });

  it("checks grades against the rubric", () => {
    const { rubric } = fields();
    expect(gradeErrors(25, 30, { c1: 18, c2: 7 }, rubric)).toEqual([]);
    expect(gradeErrors(31, 30, undefined, rubric)).toEqual(["Score can't exceed 30"]);
    expect(gradeErrors(10, 30, { c1: 25, nope: 1 }, rubric)).toEqual(['"Layout" must be between 0 and 20', 'Unknown rubric criterion "nope"']);
  });
});

describe("assignment DTOs", () => {
  it("accepts the wizard payload", () => {
    expect(messages(CreateAssignmentDto, { ...fields(), status: "DRAFT" })).toEqual([]);
  });

  it("uses the panel's messages", () => {
    const errs = messages(CreateAssignmentDto, { ...fields(), title: "ab", descriptionHtml: "<p>short</p>", attempts: "11", totalPoints: 0 });
    expect(errs).toEqual(
      expect.arrayContaining([
        "Title must be at least 3 characters",
        "Short description must be at least 10 characters",
        "Attempts must be UNLIMITED or 1–10",
        "At least 1 point",
      ]),
    );
  });

  it("allows partial updates", () => {
    expect(messages(UpdateAssignmentDto, { status: "PUBLISHED" })).toEqual([]);
    expect(messages(UpdateAssignmentDto, { status: "ARCHIVED" })).not.toEqual([]);
  });
});

describe("student submission gate", () => {
  const a = {
    status: "PUBLISHED",
    type: "FILE_UPLOAD" as const,
    dueDate: new Date("2026-11-20T18:00:00Z"),
    releaseAt: new Date("2026-11-01T03:00:00Z"),
    availability: "UNTIL_DUE" as const,
    windowStartAt: null,
    windowEndAt: null,
    lateSubmission: "ALLOW" as const,
    maxAttempts: 2,
    allowedFileTypes: "zip,pdf",
    maxFileSizeMb: 5,
  };
  const file = { originalname: "work.zip", size: 1024 };
  const on = new Date("2026-11-10T00:00:00Z");

  it("allows a valid submission", () => expect(submissionProblem(a, { file }, 0, on)).toBeNull());
  it("blocks before release, after attempts, bad files", () => {
    expect(submissionProblem(a, { file }, 0, new Date("2026-10-30T00:00:00Z"))).toMatch(/isn't open/);
    expect(submissionProblem(a, { file }, 2, on)).toBe("You've used all 2 attempts for this assignment.");
    expect(submissionProblem(a, { file: { originalname: "x.exe", size: 1 } }, 0, on)).toBe("Allowed file types: .zip, .pdf");
    expect(submissionProblem(a, { file: { originalname: "x.zip", size: 6 * 1024 * 1024 } }, 0, on)).toBe("The file must be 5 MB or smaller.");
  });
  it("respects the late policy", () => {
    const late = new Date("2026-11-21T00:00:00Z");
    expect(submissionProblem(a, { file }, 0, late)).toBeNull();
    expect(submissionProblem({ ...a, lateSubmission: "DISALLOW" }, { file }, 0, late)).toMatch(/deadline has passed/);
  });
});

describe("assignment insights", () => {
  const sub = (status: "GRADED" | "PENDING", score: number | null, isLate = false) => ({ status, score, isLate, criterionScores: {}, submittedAt: "2026-11-02T00:00:00Z" }) as unknown as AssignmentSubmission;
  it("counts and buckets", () => {
    const subs = [sub("GRADED", 29), sub("GRADED", 15, true), sub("PENDING", null)];
    expect(submissionCounts(subs)).toEqual({ total: 3, graded: 2, pending: 1, late: 1 });
    const dist = gradeDistribution(subs, 30);
    expect(dist.find((b) => b.key === "A")!.count).toBe(1);
    expect(dist.find((b) => b.key === "F")!.count).toBe(1);
  });
});
