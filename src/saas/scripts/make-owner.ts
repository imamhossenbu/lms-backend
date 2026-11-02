/**
 * Promotes an existing (verified) user to platform owner (role SUPER_ADMIN) so they can use the Owner Console API.
 *   npm run saas:make-owner -- you@example.com
 */
import "dotenv/config";
import { PrismaService } from "../../prisma/prisma.service";
import { PLATFORM_OWNER_ROLE } from "../saas.constants";

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) throw new Error("Usage: npm run saas:make-owner -- <email>");
  const prisma = new PrismaService();
  try {
    const user = await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });
    if (!user) throw new Error(`No user with email ${email}. Register first, then run this again.`);
    await prisma.user.update({ where: { id: user.id }, data: { role: PLATFORM_OWNER_ROLE, institutionId: null } });
    console.log(`✅ ${user.email} is now a platform owner (${PLATFORM_OWNER_ROLE}). Log in again to get a fresh token.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(`❌ ${err.message}`);
  process.exit(1);
});
