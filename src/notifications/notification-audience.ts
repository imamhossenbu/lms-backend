import type { Prisma } from "../../generated/prisma";
import { INACTIVE_AFTER_DAYS, INSTRUCTOR_ROLE, MUTED_USER_STATUSES, STUDENT_ROLE } from "./notifications.constants";
import type { BroadcastAudience } from "./notifications.types";

/**
 * Pure: the users a broadcast reaches, always inside the sender's institution (`institutionId = actor's ?? null`).
 * - ALL_STUDENTS: every student
 * - COURSE: students enrolled in any of the courses
 * - INSTRUCTORS: every instructor (role TEACHER)
 * - INACTIVE_STUDENTS: students who haven't signed in for INACTIVE_AFTER_DAYS days (or never)
 * Deleted and suspended (BLOCKED) users never receive broadcasts.
 */
export function audienceWhere(institutionId: string | null, audience: BroadcastAudience, courseIds: string[], now = new Date()): Prisma.UserWhereInput {
  const base: Prisma.UserWhereInput = { institutionId, deletedAt: null, status: { notIn: MUTED_USER_STATUSES } };
  switch (audience) {
    case "INSTRUCTORS":
      return { ...base, role: INSTRUCTOR_ROLE };
    case "COURSE":
      return { ...base, role: STUDENT_ROLE, enrollments: { some: { courseId: { in: courseIds.length ? courseIds : ["00000000-0000-0000-0000-000000000000"] } } } };
    case "INACTIVE_STUDENTS": {
      const cutoff = new Date(now.getTime() - INACTIVE_AFTER_DAYS * 86_400_000);
      return { ...base, role: STUDENT_ROLE, OR: [{ lastLoginAt: null }, { lastLoginAt: { lt: cutoff } }] };
    }
    default:
      return { ...base, role: STUDENT_ROLE };
  }
}
