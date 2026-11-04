import { ConflictException, NotFoundException } from "@nestjs/common";
import type { Prisma } from "../../generated/prisma";
import type { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "./auth-user";

/**
 * Multi-tenancy helpers. A tenant is an institution id; `null` is the legacy single-tenant workspace
 * (data created before the SaaS layer). Every catalogue read / write goes through these so one
 * institution can never see or change another institution's courses, categories or coupons.
 */

type Db = PrismaService | Prisma.TransactionClient;

/** The signed-in user's tenant. */
export const tenantOf = (user: Pick<AuthUser, "institutionId"> | null | undefined): string | null => user?.institutionId ?? null;

/**
 * Tenant for unauthenticated / optional-auth requests: the signed-in user's tenant, otherwise the
 * `?institution=<slug>` query (student apps, public catalogue), otherwise the legacy workspace.
 */
export async function resolvePublicTenant(prisma: Db, user: AuthUser | null | undefined, slug?: string | null): Promise<string | null> {
  if (user) return tenantOf(user);
  if (!slug) return null;
  const inst = await prisma.institution.findUnique({ where: { slug: String(slug).trim().toLowerCase() }, select: { id: true } });
  if (!inst) throw new NotFoundException("Workspace not found");
  return inst.id;
}

/** A course of this tenant, or 404 (never reveals that the id exists in another workspace). */
export async function findCourseInTenant<S extends Prisma.CourseSelect>(prisma: Db, tenantId: string | null, courseId: string, select?: S) {
  const course = await prisma.course.findFirst({ where: { id: courseId, institutionId: tenantId }, ...(select ? { select } : {}) });
  if (!course) throw new NotFoundException("Course not found");
  return course as Prisma.CourseGetPayload<{ select: S }>;
}

/** Throws 404 unless every course id belongs to this tenant. */
export async function assertCoursesInTenant(prisma: Db, tenantId: string | null, courseIds: string[]) {
  if (courseIds.length === 0) return;
  const found = await prisma.course.count({ where: { id: { in: courseIds }, institutionId: tenantId } });
  if (found !== new Set(courseIds).size) throw new NotFoundException("One or more selected courses no longer exist.");
}

/** A category of this tenant, or 404. */
export async function findCategoryInTenant(prisma: Db, tenantId: string | null, categoryId: string) {
  const category = await prisma.category.findFirst({ where: { id: categoryId, institutionId: tenantId } });
  if (!category) throw new NotFoundException("Category not found");
  return category;
}

/**
 * Slug / code uniqueness per workspace. The DB enforces it with (institutionId, slug) unique indexes,
 * but Postgres treats NULL tenants as distinct, so the legacy workspace relies on this check.
 */
export async function assertSlugFree(prisma: Db, model: "course" | "category", tenantId: string | null, slug: string, exceptId?: string) {
  const where = { institutionId: tenantId, slug, ...(exceptId ? { id: { not: exceptId } } : {}) };
  const clash = model === "course" ? await prisma.course.findFirst({ where, select: { id: true } }) : await prisma.category.findFirst({ where, select: { id: true } });
  if (clash) throw new ConflictException(`Another ${model} in this workspace already uses the slug "${slug}".`);
}
