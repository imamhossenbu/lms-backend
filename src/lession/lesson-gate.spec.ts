import { lessonGate, outlineOnly, type LessonGateInput } from "./lesson-gate";

const NOW = new Date("2026-11-05T12:00:00Z");
const base = (settings: unknown = {}, over: Partial<LessonGateInput> = {}): LessonGateInput => ({
  lesson: { id: "l2", status: "PUBLISHED", isPreview: false, editorSettings: settings },
  curriculum: ["l1", "l2", "l3"],
  enrolledAt: new Date("2026-11-01T00:00:00Z"),
  completedLessonIds: new Set(),
  country: null,
  now: NOW,
  ...over,
});
const reason = (i: LessonGateInput) => {
  const r = lessonGate(i);
  return r.allowed ? "OK" : `${r.reason}${r.hidden ? ":hidden" : ""}`;
};

describe("lessonGate", () => {
  it("publishing: drafts hidden, scheduled until the publish time", () => {
    expect(reason(base({}, { lesson: { id: "l2", status: "DRAFT", isPreview: false } }))).toBe("NOT_PUBLISHED:hidden");
    expect(reason(base({ content: { publishDate: "2026-12-01", publishTime: "09:00" } }, { lesson: { id: "l2", status: "SCHEDULED", isPreview: false, editorSettings: { content: { publishDate: "2026-12-01", publishTime: "09:00" } } } }))).toBe("NOT_PUBLISHED:hidden");
    expect(reason(base({}, { lesson: { id: "l2", status: "SCHEDULED", isPreview: false, editorSettings: { content: { publishDate: "2026-11-01", publishTime: "09:00" } } } }))).toBe("OK");
  });

  it("free preview skips enrollment and the other rules, but not publishing", () => {
    const locked = { access: { visibility: "LOCKED" } };
    expect(reason(base(locked, { enrolledAt: null, lesson: { id: "l2", status: "PUBLISHED", isPreview: true, editorSettings: locked } }))).toBe("OK");
    expect(reason(base({}, { enrolledAt: null, lesson: { id: "l2", status: "DRAFT", isPreview: true } }))).toBe("NOT_PUBLISHED:hidden");
  });

  it("needs an enrollment; no settings = open", () => {
    expect(reason(base({}, { enrolledAt: null }))).toBe("NOT_ENROLLED");
    expect(reason(base())).toBe("OK");
    expect(reason(base(null))).toBe("OK");
  });

  it("visibility private (hidden) / locked", () => {
    expect(reason(base({ access: { visibility: "PRIVATE" } }))).toBe("PRIVATE:hidden");
    expect(reason(base({ access: { visibility: "LOCKED" } }))).toBe("LOCKED");
    expect(reason(base({ access: { visibility: "PUBLIC" } }))).toBe("OK");
  });

  it("previous / specific lesson must be completed", () => {
    expect(reason(base({ access: { accessType: "PREVIOUS_LESSON" } }))).toBe("PREREQUISITE");
    expect(reason(base({ access: { accessType: "PREVIOUS_LESSON" } }, { completedLessonIds: new Set(["l1"]) }))).toBe("OK");
    expect(reason(base({ access: { accessType: "PREVIOUS_LESSON" } }, { lesson: { id: "l1", status: "PUBLISHED", isPreview: false, editorSettings: { access: { accessType: "PREVIOUS_LESSON" } } } }))).toBe("OK");
    expect(reason(base({ access: { accessType: "SPECIFIC_LESSON", prerequisiteLessonId: "l3" } }))).toBe("PREREQUISITE");
    expect(reason(base({ access: { accessType: "SPECIFIC_LESSON", prerequisiteLessonId: "gone" } }))).toBe("OK");
  });

  it("date window and countries", () => {
    const win = (s: string, e: string) => ({ access: { dateRestriction: { enabled: true, startDate: s, startTime: "00:00", endDate: e, endTime: "23:59" } } });
    expect(reason(base(win("2026-11-10", "2026-11-20")))).toBe("DATE_WINDOW");
    expect(reason(base(win("2026-10-01", "2026-10-20")))).toBe("DATE_WINDOW");
    expect(reason(base(win("2026-11-01", "2026-11-20")))).toBe("OK");
    const geo = { access: { geoRestriction: { enabled: true, countries: ["BD", "IN"] } } };
    expect(reason(base(geo, { country: "US" }))).toBe("COUNTRY");
    expect(reason(base(geo, { country: "bd" }))).toBe("OK");
    expect(reason(base(geo, { country: null }))).toBe("OK");
  });

  it("drip: after enrollment, specific date, manual, dependencies, hide vs message", () => {
    const after = (n: number, unit = "DAYS", extra = {}) => ({ drip: { releaseType: "AFTER_ENROLLMENT", releaseValue: n, releaseUnit: unit, ...extra } });
    expect(reason(base(after(2)))).toBe("OK"); // enrolled Nov 1, +2 days = Nov 3
    expect(reason(base(after(1, "WEEKS")))).toBe("DRIP");
    expect(reason(base(after(1, "WEEKS", { beforeRelease: "HIDE" })))).toBe("DRIP:hidden");
    const msg = lessonGate(base(after(1, "WEEKS", { beforeRelease: "SHOW_MESSAGE", lockedMessage: "Coming next week!" })));
    expect(msg.allowed === false && msg.message).toBe("Coming next week!");
    expect(reason(base({ drip: { releaseType: "SPECIFIC_DATE", releaseDate: "2026-12-01", releaseTime: "10:00" } }))).toBe("DRIP");
    expect(reason(base({ drip: { releaseType: "SPECIFIC_DATE", releaseDate: "2026-11-01", releaseTime: "10:00" } }))).toBe("OK");
    expect(reason(base({ drip: { releaseType: "MANUAL" } }))).toBe("DRIP");
    expect(reason(base({ drip: { releaseType: "IMMEDIATE", dependencies: { enabled: true, lessonIds: ["l1", "l3"] } } }, { completedLessonIds: new Set(["l1"]) }))).toBe("DRIP");
    expect(reason(base({ drip: { releaseType: "IMMEDIATE", dependencies: { enabled: true, lessonIds: ["l1", "l3"] } } }, { completedLessonIds: new Set(["l1", "l3"]) }))).toBe("OK");
  });

  it("lesson lists keep content only for free previews", () => {
    expect(outlineOnly({ isPreview: false, content: "x", videoUrl: "v", title: "t" })).toEqual({ isPreview: false, content: null, videoUrl: null, title: "t" });
    expect(outlineOnly({ isPreview: true, content: "x", videoUrl: "v" })).toEqual({ isPreview: true, content: "x", videoUrl: "v" });
  });
});
