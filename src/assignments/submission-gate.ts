import type { Assignment } from "../../generated/prisma";
import { fileTypesFromColumn } from "./assignment.mapper";

/** What a student sent (after DTO validation). */
export interface SubmissionInput {
  textAnswer?: string;
  link?: string;
  file?: { originalname: string; size: number };
}

type GateAssignment = Pick<
  Assignment,
  "status" | "type" | "dueDate" | "releaseAt" | "availability" | "windowStartAt" | "windowEndAt" | "lateSubmission" | "maxAttempts" | "allowedFileTypes" | "maxFileSizeMb"
>;

/**
 * Can this student submit now? Pure: returns the first user-facing problem, or null plus whether it's late.
 * Order: open → window → deadline policy → attempts → answer shape.
 */
export function submissionProblem(a: GateAssignment, input: SubmissionInput, priorAttempts: number, now = new Date()): string | null {
  if (a.status === "DRAFT") return "This assignment isn't available.";
  if (a.releaseAt && now < a.releaseAt) return "This assignment isn't open for submissions yet.";
  if (a.availability === "WINDOW") {
    if (a.windowStartAt && now < a.windowStartAt) return "The submission window hasn't opened yet.";
    if (a.windowEndAt && now > a.windowEndAt) return "The submission window has closed.";
  }
  if (now > a.dueDate && a.lateSubmission === "DISALLOW") return "The deadline has passed and late submissions aren't accepted.";
  if (a.maxAttempts !== null && priorAttempts >= a.maxAttempts)
    return `You've used all ${a.maxAttempts} attempt${a.maxAttempts === 1 ? "" : "s"} for this assignment.`;

  if (a.type === "FILE_UPLOAD") {
    if (!input.file) return "Attach your file.";
    const ext = `.${input.file.originalname.split(".").pop()?.toLowerCase() ?? ""}`;
    const allowed = fileTypesFromColumn(a.allowedFileTypes);
    if (allowed.length && !allowed.includes(ext)) return `Allowed file types: ${allowed.join(", ")}`;
    if (input.file.size > a.maxFileSizeMb * 1024 * 1024) return `The file must be ${a.maxFileSizeMb} MB or smaller.`;
  }
  if (a.type === "TEXT" && !input.textAnswer?.trim()) return "Write your answer.";
  if (a.type === "LINK" && !input.link) return "Paste the link to your work.";
  return null;
}

export const isLateAt = (a: Pick<Assignment, "dueDate">, now = new Date()) => now > a.dueDate;
