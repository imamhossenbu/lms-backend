import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { CreateStudentDto, StudentNoteDto, StudentQueryDto } from "./dto/student.dto";
import { letterGrade, noteCategoryFromDb, noteCategoryToDb, pct, STATUS_LABEL, studentIdCode } from "./students.constants";

const messages = (cls: any, body: object) => validateSync(plainToInstance(cls, body), { whitelist: true }).flatMap((e) => Object.values(e.constraints ?? {}));

describe("students constants", () => {
  it("maps DB statuses to panel labels", () => {
    expect(STATUS_LABEL.ACTIVE).toBe("Active");
    expect(STATUS_LABEL.PENDING).toBe("Inactive");
    expect(STATUS_LABEL.BLOCKED).toBe("Suspended");
  });

  it("builds a stable student code", () => {
    expect(studentIdCode("3f2a9c1e-1111-2222-3333-444455556666")).toBe("STU-3F2A9C1");
  });

  it("grades and percentages", () => {
    expect(letterGrade(95)).toBe("A+");
    expect(letterGrade(81)).toBe("A-");
    expect(letterGrade(30)).toBe("F");
    expect(pct(3, 5)).toBe(60);
    expect(pct(1, 0)).toBe(0);
  });

  it("round-trips note categories", () => {
    expect(noteCategoryToDb("counseling_call")).toBe("COUNSELING_CALL");
    expect(noteCategoryFromDb("PAYMENT_ISSUE")).toBe("payment_issue");
  });
});

describe("student DTOs", () => {
  it("accepts the panel's create payload and normalises email", () => {
    const dto = plainToInstance(CreateStudentDto, { name: " Samira Akter ", email: " Samira@Example.com", phone: "+880 1712 345678", status: "Active", enrolledCourseIds: [] });
    expect(validateSync(dto)).toHaveLength(0);
    expect(dto.email).toBe("samira@example.com");
    expect(dto.name).toBe("Samira Akter");
  });

  it("rejects bad input with friendly messages", () => {
    const errs = messages(CreateStudentDto, { name: "S", email: "nope", status: "Gone", enrolledCourseIds: ["x"] });
    expect(errs).toEqual(
      expect.arrayContaining([
        "Full name must be at least 2 characters",
        "Please provide a valid email address",
        "Status must be Active, Inactive or Suspended",
        "Each course id must be valid",
      ]),
    );
  });

  it("applies list defaults and coerces query strings", () => {
    const q = plainToInstance(StudentQueryDto, { page: "2", limit: "25", status: "Inactive" });
    expect(validateSync(q)).toHaveLength(0);
    expect([q.page, q.limit, q.sortBy, q.sortOrder]).toEqual([2, 25, "joinDate", "desc"]);
    expect(messages(StudentQueryDto, { limit: "500" })).toContain("limit can be at most 100");
  });

  it("validates notes", () => {
    expect(messages(StudentNoteDto, { category: "general", content: "Called parent about attendance" })).toHaveLength(0);
    expect(messages(StudentNoteDto, { category: "random", content: "x" })).toEqual(expect.arrayContaining(["Choose a note category", "Write a note first"]));
  });
});
