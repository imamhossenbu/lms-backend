import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { generatePassword } from "../common/accounts";
import { plainTextLength, sanitizeRichText } from "../common/html";
import { CreateInstructorDto, InstructorNoteDto, UpdateInstructorDto } from "./dto/instructor.dto";
import {
  courseStatusLabel,
  deviceFromUserAgent,
  instructorStatusLabel,
  noteTypeFromDb,
  noteTypeToDb,
  parseSkills,
  parseSocials,
  priorityFromDb,
  priorityToDb,
} from "./instructors.constants";

const messages = (cls: any, body: object) =>
  validateSync(plainToInstance(cls, body), { whitelist: true }).flatMap((e) => [
    ...Object.values(e.constraints ?? {}),
    ...(e.children ?? []).flatMap((c) => Object.values(c.constraints ?? {})),
  ]);

describe("sanitizeRichText", () => {
  it("keeps formatting and safe links", () => {
    expect(sanitizeRichText('<p>Hello <strong>there</strong> <a href="https://x.com" onclick="evil()">x</a></p>')).toBe(
      '<p>Hello <strong>there</strong> <a href="https://x.com" target="_blank" rel="noopener noreferrer">x</a></p>',
    );
  });

  it("removes scripts, event handlers and javascript: links", () => {
    const out = sanitizeRichText('<p onmouseover="x()">Hi</p><script>alert(1)</script><a href="javascript:alert(1)">bad</a><img src=x onerror=alert(1)>');
    expect(out).not.toMatch(/script|onmouseover|javascript|onerror|<img/i);
    expect(out).toContain("<p>Hi</p>");
  });

  it("counts visible text only", () => {
    expect(plainTextLength("<p>  <b>abc</b>   def </p>")).toBe(7);
  });
});

describe("instructor constants", () => {
  it("maps statuses", () => {
    expect(instructorStatusLabel("ACTIVE")).toBe("Active");
    expect(instructorStatusLabel("PENDING")).toBe("Inactive");
    expect(courseStatusLabel("PUBLISHED")).toBe("Active");
    expect(courseStatusLabel("DRAFT")).toBe("Draft");
  });

  it("round-trips note enums", () => {
    expect(noteTypeToDb("Content Update")).toBe("CONTENT_UPDATE");
    expect(noteTypeFromDb("CONTENT_UPDATE")).toBe("Content Update");
    expect(priorityToDb("High")).toBe("HIGH");
    expect(priorityFromDb("MEDIUM")).toBe("Medium");
  });

  it("parses free-text profile fields", () => {
    expect(parseSkills('["React", " Node "]')).toEqual(["React", "Node"]);
    expect(parseSkills("React, Node,,")).toEqual(["React", "Node"]);
    expect(parseSkills(null)).toEqual([]);
    expect(parseSocials('{"linkedin":"https://l.in/a"}')).toEqual({ linkedin: "https://l.in/a", twitter: "", website: "" });
    expect(parseSocials("not json")).toEqual({ linkedin: "", twitter: "", website: "" });
    expect(deviceFromUserAgent("Mozilla/5.0 (iPhone)")).toBe("Mobile");
    expect(deviceFromUserAgent("")).toBe("System");
  });

  it("generates strong passwords", () => {
    const pw = generatePassword();
    expect(pw).toHaveLength(12);
    expect(pw).toMatch(/[A-Z]/);
    expect(pw).toMatch(/[a-z]/);
    expect(pw).toMatch(/[0-9]/);
    expect(pw).toMatch(/[!@#$%&*?]/);
  });
});

describe("instructor DTOs", () => {
  it("accepts the panel's create form", () => {
    expect(messages(CreateInstructorDto, { name: "Dr. Angela Yu", email: "angela@example.com", phone: "+880 1712-345678", status: "Active" })).toHaveLength(0);
  });

  it("uses the panel's error messages", () => {
    expect(messages(CreateInstructorDto, { name: "A", email: "x", phone: "12", status: "Suspended" })).toEqual(
      expect.arrayContaining([
        "Full name must be at least 2 characters",
        "Please provide a valid email address",
        "Please provide a valid phone number",
        "Status must be Active or Inactive",
      ]),
    );
  });

  it("validates social links", () => {
    expect(messages(UpdateInstructorDto, { socials: { linkedin: "https://linkedin.com/in/a", website: "" } })).toHaveLength(0);
    expect(messages(UpdateInstructorDto, { socials: { twitter: "not a url" } })).toContain("twitter must be a full http(s) URL");
  });

  it("requires a reminder date only when the reminder is on", () => {
    const note = { title: "Quarterly review", content: "<p>Great work this quarter</p>", type: "Performance", priority: "Low", tags: ["Positive"] };
    expect(messages(InstructorNoteDto, { ...note, hasReminder: false })).toHaveLength(0);
    expect(messages(InstructorNoteDto, { ...note, hasReminder: true })).toContain("Please pick a reminder date");
    expect(messages(InstructorNoteDto, { ...note, hasReminder: true, reminderDate: "2026-11-30" })).toHaveLength(0);
    expect(messages(InstructorNoteDto, { ...note, type: "Gossip", hasReminder: false })).toContain("Please select a note type");
  });
});
