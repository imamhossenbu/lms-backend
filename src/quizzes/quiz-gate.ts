import type { Quiz } from "../../generated/prisma";

type GateQuiz = Pick<Quiz, "status" | "startsAt" | "endsAt" | "maxAttempts">;

/** Is the quiz open to students right now? Returns a user-facing problem or null. Pure. */
export function quizClosedReason(q: GateQuiz, now = new Date()): string | null {
  if (q.status !== "PUBLISHED") return "This quiz isn't available.";
  if (q.startsAt && now < q.startsAt) return "This quiz hasn't opened yet.";
  if (q.endsAt && now > q.endsAt) return "This quiz has closed.";
  return null;
}

/** Can the student start another attempt? */
export function attemptLimitReason(q: GateQuiz, priorAttempts: number): string | null {
  if (q.maxAttempts !== null && priorAttempts >= q.maxAttempts)
    return `You've used all ${q.maxAttempts} attempt${q.maxAttempts === 1 ? "" : "s"} for this quiz.`;
  return null;
}

/** Fisher–Yates with an injectable random source (tests). */
export function shuffled<T>(items: T[], random = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
