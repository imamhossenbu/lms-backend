import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { CreateLiveClassDto } from "./dto/live-class.dto";
import { attendanceStats, attendanceTimeline, liveListStats } from "./live-class-insights";
import { isRescheduled, liveClassRuleErrors } from "./live-class-rules";
import { attendanceStatus, displayStatus, platformOf, toEnrollment, toLiveClassData, toLiveClassItem, watchMinutesOf } from "./live-class.mapper";
import type { LiveClassFields, LiveEnrollment } from "./live-classes.types";

const messages = (cls: any, body: object) =>
  validateSync(plainToInstance(cls, body), { whitelist: true }).flatMap(function flat(e): string[] {
    return [...Object.values(e.constraints ?? {}), ...(e.children ?? []).flatMap(flat)];
  });

const fields = (over: Partial<LiveClassFields> = {}): LiveClassFields => ({
  title: "React Q&A",
  descriptionHtml: "<p>Bring your questions.</p>",
  courseId: "11111111-1111-4111-8111-111111111111",
  instructorId: "22222222-2222-4222-8222-222222222222",
  type: "QA",
  date: "2027-01-10",
  startTime: "10:00",
  endTime: "11:30",
  platform: "ZOOM",
  meetingLink: "https://us02web.zoom.us/j/123",
  meetingId: "123",
  passcode: "x",
  sendLinkToStudents: true,
  capacity: 50,
  settings: { allowQa: true, enableChat: true, recordClass: false, makePublic: false, sendReminder: true, autoAttendance: true },
  reminder: "15",
  thumbnailUrl: "",
  ...over,
});
const NOW = new Date("2027-01-01T00:00:00Z");

describe("live class rules", () => {
  it("accepts a valid class", () => expect(liveClassRuleErrors(fields(), { requireFuture: true, now: NOW })).toEqual([]));
  it("checks duration, platform link, reminder and future start", () => {
    expect(liveClassRuleErrors(fields({ endTime: "10:10" }), { requireFuture: false })).toEqual(["A class must be at least 15 minutes"]);
    expect(liveClassRuleErrors(fields({ endTime: "09:00" }), { requireFuture: false })).toEqual(["End time must be after the start time"]);
    expect(liveClassRuleErrors(fields({ endTime: "19:00" }), { requireFuture: false })).toEqual(["A class can be at most 8 hours"]);
    expect(liveClassRuleErrors(fields({ platform: "GOOGLE_MEET" }), { requireFuture: false })).toEqual(["This doesn't look like a Google Meet link"]);
    expect(liveClassRuleErrors(fields({ reminder: "NONE" }), { requireFuture: false })).toEqual(["Choose when to send the reminder"]);
    expect(liveClassRuleErrors(fields({ date: "2026-12-01" }), { requireFuture: true, now: NOW })).toEqual(["The class must start in the future"]);
    expect(isRescheduled(fields(), fields({ endTime: "12:00" }))).toBe(true);
  });
  it("DTO uses the panel's messages", () => {
    expect(messages(CreateLiveClassDto, fields())).toEqual([]);
    expect(messages(CreateLiveClassDto, { ...fields(), title: "ab", meetingLink: "zoom", capacity: 0 })).toEqual(
      expect.arrayContaining(["Class title must be at least 3 characters", "Enter a valid URL starting with https://", "At least 1 seat"]),
    );
  });
});

describe("live class mapper", () => {
  const row = (over = {}) => {
    const now = new Date();
    return { ...(toLiveClassData(fields()) as any), id: "c", institutionId: null, status: "ACTIVE", recordingUrl: null, reminderSentAt: null, createdAt: now, updatedAt: now, ...over };
  };
  it("round-trips the form", () => {
    const item = toLiveClassItem(row());
    expect(item).toMatchObject({ date: "2027-01-10", startTime: "10:00", endTime: "11:30", platform: "ZOOM", reminder: "15", status: "ACTIVE" });
    expect(row().startTime.toISOString()).toBe("2027-01-10T04:00:00.000Z");
  });
  it("reads first-version rows", () => {
    expect(platformOf("https://zoom.us/j/1")).toBe("ZOOM");
    expect(platformOf("https://meet.google.com/abc")).toBe("GOOGLE_MEET");
    expect(toLiveClassItem(row({ status: "SCHEDULED", platform: "CUSTOM", meetingUrl: "https://zoom.us/j/1", settings: {} })).platform).toBe("ZOOM");
    expect(toLiveClassItem(row({ status: "SCHEDULED" })).status).toBe("ACTIVE");
  });
  it("derives display status from the clock", () => {
    const c = { status: "ACTIVE", startTime: new Date("2027-01-10T04:00:00Z"), endTime: new Date("2027-01-10T05:30:00Z") };
    expect(displayStatus(c, new Date("2027-01-10T04:30:00Z"))).toBe("LIVE");
    expect(displayStatus(c, new Date("2027-01-10T06:00:00Z"))).toBe("COMPLETED");
    expect(displayStatus(c, new Date("2027-01-08T04:00:00Z"))).toBe("UPCOMING");
    expect(displayStatus(c, new Date("2027-01-01T00:00:00Z"))).toBe("SCHEDULED");
    expect(displayStatus({ ...c, status: "CANCELLED" })).toBe("CANCELLED");
  });
  it("maps attendance rows", () => {
    expect(attendanceStatus(undefined, true)).toBe("NOT_JOINED");
    expect(attendanceStatus({ status: "RSVP", joinedAt: null }, false)).toBe("NOT_JOINED");
    expect(attendanceStatus({ status: "RSVP", joinedAt: null }, true)).toBe("ABSENT");
    expect(attendanceStatus({ status: "COMPLETED", joinedAt: new Date() }, true)).toBe("ATTENDED");
    expect(watchMinutesOf({ durationMinutes: 0, joinedAt: new Date("2027-01-10T04:00:00Z"), leftAt: new Date("2027-01-10T04:45:00Z") })).toBe(45);
    const e = toEnrollment("c", { id: "s", name: "S", email: "e" }, new Date(), { id: "a", liveClassId: "c", userId: "s", joinedAt: new Date("2027-01-10T04:05:00Z"), leftAt: null, durationMinutes: 30, status: "ACTIVE", createdAt: new Date() }, false);
    expect(e).toMatchObject({ status: "ATTENDED", joinTime: "10:05", leaveTime: "", watchMinutes: 30 });
  });
});

describe("live class insights", () => {
  const r = (status: LiveEnrollment["status"], joinTime = "", leaveTime = "", watchMinutes = 0) => ({ status, joinTime, leaveTime, watchMinutes }) as LiveEnrollment;
  it("computes attendance and the presence timeline", () => {
    const rows = [r("ATTENDED", "10:00", "10:30", 30), r("ATTENDED", "10:10", "", 20), r("ABSENT"), r("NOT_JOINED")];
    expect(attendanceStats(rows)).toMatchObject({ enrolled: 4, attended: 2, absent: 1, attendedPct: 50, avgWatchMinutes: 25 });
    const t = attendanceTimeline(rows, { startTime: new Date("2027-01-10T04:00:00Z"), endTime: new Date("2027-01-10T04:30:00Z") }, 10);
    expect(t.map((p) => p.present)).toEqual([1, 2, 2, 1]);
  });
  it("counts list cards", () => {
    const now = new Date("2027-01-10T00:00:00Z");
    const s = liveListStats(
      [
        { id: "a", status: "ACTIVE", startTime: new Date("2027-01-05T04:00:00Z"), endTime: new Date("2027-01-05T05:00:00Z") },
        { id: "b", status: "CANCELLED", startTime: new Date("2027-01-06T04:00:00Z"), endTime: new Date("2027-01-06T05:00:00Z") },
        { id: "c", status: "ACTIVE", startTime: new Date("2027-01-11T04:00:00Z"), endTime: new Date("2027-01-11T05:00:00Z") },
      ],
      new Map([["a", 3]]),
      now,
    );
    expect(s).toMatchObject({ total: 3, attendees: 3, completed: 1, upcoming: 1, cancelled: 1 });
  });
});
