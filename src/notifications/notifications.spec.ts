import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { SaveBroadcastDto } from "./dto/broadcast.dto";
import { InboxIdsDto } from "./dto/inbox.dto";
import { UpdateTemplateDto } from "./dto/template.dto";
import { audienceWhere } from "./notification-audience";
import { broadcastOverview, deliveryByChannel, deliveryStats, inboxStats, opensTimeline, unreadByCategory } from "./notification-insights";
import { broadcastRuleErrors, canCancelBroadcast, canDeleteBroadcast, canEditBroadcast, parseScheduledAt, templatePlaceholderErrors } from "./notification-rules";
import { broadcastEmailBody, htmlToText, planBroadcastDelivery, renderTemplate, templateSlug, toBroadcast, toInboxItem, toTemplateItem } from "./notification.mapper";
import type { BroadcastFields } from "./notifications.types";

const messages = (cls: any, body: object) =>
  validateSync(plainToInstance(cls, body), { whitelist: true }).flatMap(function flat(e): string[] {
    return [...Object.values(e.constraints ?? {}), ...(e.children ?? []).flatMap(flat)];
  });

const NOW = new Date("2027-01-01T00:00:00Z");
const fields = (over: Partial<BroadcastFields> = {}): BroadcastFields => ({
  title: "Exam week schedule",
  messageHtml: "<p>Exams start on Monday, good luck!</p>",
  audience: "ALL_STUDENTS",
  courseIds: [],
  channels: ["IN_APP"],
  priority: "NORMAL",
  ctaLabel: "",
  ctaUrl: "",
  timing: "NOW",
  scheduledAt: "",
  ...over,
});

describe("broadcast rules", () => {
  it("accepts a valid broadcast", () => expect(broadcastRuleErrors(fields(), { now: NOW })).toEqual([]));
  it("needs courses for the COURSE audience", () => expect(broadcastRuleErrors(fields({ audience: "COURSE" }), { now: NOW })).toEqual(["Select at least one course"]));
  it("needs both CTA label and link, and a valid link", () => {
    expect(broadcastRuleErrors(fields({ ctaLabel: "Open" }), { now: NOW })).toEqual(["Add both a button label and a link"]);
    expect(broadcastRuleErrors(fields({ ctaLabel: "Open", ctaUrl: "javascript:alert(1)" }), { now: NOW })).toEqual(["Use an https:// link or a page path like /courses"]);
    expect(broadcastRuleErrors(fields({ ctaLabel: "Open", ctaUrl: "/courses" }), { now: NOW })).toEqual([]);
    expect(broadcastRuleErrors(fields({ ctaLabel: "Open", ctaUrl: "https://edupro.com/x" }), { now: NOW })).toEqual([]);
  });
  it("limits push messages to 180 characters", () => {
    const long = `<p>${"a".repeat(181)}</p>`;
    expect(broadcastRuleErrors(fields({ channels: ["PUSH"], messageHtml: long }), { now: NOW })[0]).toMatch(/Push messages must be 180/);
    expect(broadcastRuleErrors(fields({ channels: ["EMAIL"], messageHtml: long }), { now: NOW })).toEqual([]);
  });
  it("schedules at least 5 minutes ahead, except drafts", () => {
    expect(broadcastRuleErrors(fields({ timing: "SCHEDULE", scheduledAt: "" }), { now: NOW })).toEqual(["Pick a date and time"]);
    expect(broadcastRuleErrors(fields({ timing: "SCHEDULE", scheduledAt: "2027-01-01T00:03:00Z" }), { now: NOW })).toEqual(["Schedule at least 5 minutes from now"]);
    expect(broadcastRuleErrors(fields({ timing: "SCHEDULE", scheduledAt: "2027-01-01T00:10:00Z" }), { now: NOW })).toEqual([]);
    expect(broadcastRuleErrors(fields({ timing: "SCHEDULE", scheduledAt: "" }), { now: NOW, asDraft: true })).toEqual([]);
  });
  it("reads datetime-local values in workspace time (UTC+6)", () => {
    expect(parseScheduledAt("2027-01-10T09:30")!.toISOString()).toBe("2027-01-10T03:30:00.000Z");
    expect(parseScheduledAt("2027-01-10T09:30:00.000Z")!.toISOString()).toBe("2027-01-10T09:30:00.000Z");
    expect(parseScheduledAt("nope")).toBeNull();
  });
  it("lifecycle guards", () => {
    expect([canEditBroadcast("DRAFT"), canEditBroadcast("SCHEDULED"), canEditBroadcast("SENT"), canEditBroadcast("CANCELLED")]).toEqual([true, true, false, false]);
    expect([canCancelBroadcast("SCHEDULED"), canCancelBroadcast("DRAFT")]).toEqual([true, false]);
    expect([canDeleteBroadcast("SENT"), canDeleteBroadcast("CANCELLED")]).toEqual([false, true]);
  });
});

describe("DTO messages (copied from the panel)", () => {
  const valid = { title: "Exam week", messageHtml: "<p>Exams start on Monday.</p>", audience: "ALL_STUDENTS", channels: ["IN_APP"] };
  it("accepts a minimal compose payload", () => expect(messages(SaveBroadcastDto, valid)).toEqual([]));
  it("reports field errors", () => {
    const m = messages(SaveBroadcastDto, { ...valid, title: "Hi", messageHtml: "<p>short</p>", channels: [], ctaLabel: "x".repeat(31), courseIds: ["nope"] });
    expect(m).toEqual(
      expect.arrayContaining(["Title must be at least 5 characters", "Write at least 10 characters", "Choose at least one channel", "30 characters or less", "Select a valid course"]),
    );
  });
  it("template editor", () => {
    expect(messages(UpdateTemplateDto, { name: "x", subject: "", body: "short", channels: [], enabled: true })).toEqual(
      expect.arrayContaining(["Name is required", "Subject is required", "Write at least 10 characters", "Choose at least one channel"]),
    );
  });
  it('inbox ids accept a list or "all"', () => {
    expect(messages(InboxIdsDto, { ids: "all" })).toEqual([]);
    expect(messages(InboxIdsDto, { ids: ["x"] })).toEqual(["Invalid notification id"]);
    expect(messages(InboxIdsDto, { ids: [] })).toEqual(["Select at least one notification"]);
  });
});

describe("templates", () => {
  it("only allows the trigger's placeholders", () => {
    expect(templatePlaceholderErrors("QUIZ_RESULT", { subject: "{quiz_title}", body: "Hi {student_name} {score}" })).toEqual([]);
    expect(templatePlaceholderErrors("QUIZ_RESULT", { subject: "{course_title}", body: "ok" })).toEqual(["{course_title} isn't available for this event"]);
  });
  it("renders {x} and legacy {{x}} placeholders, leaving unknown ones", () =>
    expect(renderTemplate("Hi {student_name}, {{course_title}} {nope}", { student_name: "Sara", course_title: "React" })).toBe("Hi Sara, React {nope}"));
  it("slugs are unique per institution", () => {
    expect(templateSlug("inst-1", "PASSWORD_RESET")).toBe("inst-1:password-reset");
    expect(templateSlug(null, "QUIZ_RESULT")).toBe("default:quiz-result");
  });
  it("maps rows (locked stays enabled)", () => {
    const item = toTemplateItem(
      { id: "t1", slug: "x:password-reset", title: "S", message: "B", type: "PASSWORD_RESET", institutionId: "x", trigger: "PASSWORD_RESET", name: "", channels: [], enabled: false, locked: true, updatedAt: NOW },
      3,
    );
    expect(item).toMatchObject({ slug: "password-reset", name: "Password reset", channels: ["EMAIL"], enabled: true, locked: true, sentLast30: 3 });
  });
});

describe("mapper", () => {
  it("turns rich text into plain text", () => expect(htmlToText("<p>Hello &amp; welcome</p><ul><li>One</li><li>Two</li></ul>")).toBe("Hello & welcome\n• One\n• Two"));
  it("adds the CTA to email bodies", () =>
    expect(broadcastEmailBody({ messageHtml: "<p>New course!</p>", ctaLabel: "Open", ctaUrl: "/courses" }, "https://app.edu/")).toBe("New course!\n\nOpen: https://app.edu/courses"));
  it("maps legacy announcements defensively", () => {
    const b = toBroadcast(
      {
        id: "a1", courseId: "c1", createdBy: "u1", title: "Old", message: "Line <1>", targetRole: "STUDENT", createdAt: NOW,
        institutionId: null, messageHtml: "", audience: "weird", courseIds: [], channels: [], priority: "", ctaLabel: "", ctaUrl: "", status: "", sendAt: null, recipientCount: 0, updatedAt: NOW,
      } as any,
      "Admin",
    );
    expect(b).toMatchObject({ audience: "COURSE", courseIds: ["c1"], channels: ["IN_APP"], status: "SENT", sendAt: NOW.toISOString(), messageHtml: "<p>Line &lt;1&gt;</p>" });
  });
  it("maps legacy notification types to categories", () => {
    const n = { id: "n", userId: "u", title: "t", message: "m", type: "CERTIFICATE_ISSUED", isRead: false, createdAt: NOW, institutionId: null, category: "SYSTEM", priority: "x", href: "", isArchived: false, readAt: null, broadcastId: null };
    expect(toInboxItem(n)).toMatchObject({ category: "CERTIFICATE", priority: "NORMAL" });
  });
});

describe("delivery plan", () => {
  let i = 0;
  const id = () => `id-${++i}`;
  const recipients = [
    { id: "u1", name: "A", email: "a@x.com", institutionId: "inst" },
    { id: "u2", name: "B", email: "", institutionId: "inst" },
    { id: "u1", name: "A", email: "a@x.com", institutionId: "inst" },
  ];
  it("creates one in-app row per recipient, queues emails, fails push", () => {
    const plan = planBroadcastDelivery({ id: "b1", title: "T", messageHtml: "<p>Hello</p>", channels: ["IN_APP", "EMAIL", "PUSH"], priority: "HIGH", ctaUrl: "/x" }, recipients, NOW, id);
    expect(plan.notifications).toHaveLength(2);
    expect(plan.notifications[0]).toMatchObject({ userId: "u1", institutionId: "inst", message: "Hello", priority: "HIGH", href: "/x", broadcastId: "b1", type: "BROADCAST" });
    expect(plan.deliveries).toHaveLength(6);
    expect(plan.emails).toEqual([{ deliveryId: expect.any(String), to: "a@x.com", name: "A" }]);
    const failed = plan.deliveries.filter((d) => d.status === "FAILED").map((d) => `${d.userId}:${d.channel}`);
    expect(failed.sort()).toEqual(["u1:PUSH", "u2:EMAIL", "u2:PUSH"]);
    const inApp = plan.deliveries.find((d) => d.userId === "u1" && d.channel === "IN_APP")!;
    expect(inApp.notificationId).toBe(plan.notifications[0].id);
  });
});

describe("audience", () => {
  it("always scopes to the institution and skips deleted / suspended users", () => {
    const w = audienceWhere("inst", "COURSE", ["c1"], NOW) as any;
    expect(w).toMatchObject({ institutionId: "inst", deletedAt: null, role: "STUDENT", status: { notIn: ["BLOCKED"] }, enrollments: { some: { courseId: { in: ["c1"] } } } });
    expect(audienceWhere(null, "INSTRUCTORS", [])).toMatchObject({ institutionId: null, role: "TEACHER" });
    const inactive = audienceWhere("inst", "INACTIVE_STUDENTS", [], NOW) as any;
    expect(inactive.OR[1].lastLoginAt.lt.toISOString()).toBe("2026-12-02T00:00:00.000Z");
  });
});

describe("insights", () => {
  const rows = [
    { userId: "u1", channel: "IN_APP", status: "CLICKED", openedAt: new Date(NOW.getTime() + 30 * 60_000) },
    { userId: "u1", channel: "EMAIL", status: "DELIVERED" },
    { userId: "u2", channel: "IN_APP", status: "OPENED", openedAt: new Date(NOW.getTime() + 90 * 60_000) },
    { userId: "u2", channel: "EMAIL", status: "FAILED" },
  ];
  it("delivery funnel", () =>
    expect(deliveryStats(rows)).toEqual({ total: 4, delivered: 3, failed: 1, opened: 2, clicked: 1, deliveryRate: 75, openRate: 66.7, clickRate: 50, recipients: 2 }));
  it("per channel + timeline + overview", () => {
    expect(deliveryByChannel(rows).map((c) => [c.channel, c.total])).toEqual([["IN_APP", 2], ["EMAIL", 2]]);
    expect(opensTimeline(NOW, rows, 3).map((h) => h.opens)).toEqual([1, 1, 0]);
    expect(broadcastOverview({ sentLast30: 1, scheduled: 2, drafts: 0 }, rows)).toEqual({ sentLast30: 1, scheduled: 2, drafts: 0, avgOpenRate: 66.7, avgClickRate: 50, reached: 2 });
  });
  it("inbox counters", () => {
    const inbox = [
      { category: "PAYMENT" as const, priority: "HIGH", isRead: false, isArchived: false },
      { category: "PAYMENT" as const, priority: "NORMAL", isRead: true, isArchived: false },
      { category: "SYSTEM" as const, priority: "HIGH", isRead: false, isArchived: true },
    ];
    expect(inboxStats(inbox)).toEqual({ total: 2, unread: 1, highPriority: 1, archived: 1 });
    expect(unreadByCategory(inbox)).toEqual({ PAYMENT: 1 });
  });
});
