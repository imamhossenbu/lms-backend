import { ConflictException } from "@nestjs/common";
import { randomInt } from "crypto";
import type { PrismaService } from "../prisma/prisma.service";

export const BCRYPT_ROUNDS = 10;

/** Random password with upper, lower, digit and symbol (no look-alike characters such as O/0, l/1). */
export function generatePassword(length = 12): string {
  const sets = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnopqrstuvwxyz", "23456789", "!@#$%&*?"];
  const all = sets.join("");
  const chars = sets.map((set) => set[randomInt(set.length)]!);
  while (chars.length < length) chars.push(all[randomInt(all.length)]!);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join("");
}

/** Throws 409 when another account (including a soft-deleted one) already uses the email. */
export async function assertEmailFree(prisma: PrismaService, email: string, exceptUserId?: string) {
  const existing = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" }, ...(exceptUserId ? { id: { not: exceptUserId } } : {}) },
    select: { deletedAt: true },
  });
  if (!existing) return;
  throw new ConflictException(existing.deletedAt ? "A deleted account still uses this email address." : "An account with this email already exists.");
}
