import "reflect-metadata";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { CatalogAccessGuard } from "./catalog-access.guard";
import { assertCoursesInTenant, assertSlugFree, findCourseInTenant, resolvePublicTenant, tenantOf } from "./tenancy";

/** Tiny in-memory stand-in for the Prisma calls these helpers make. */
const courses = [
  { id: "c-a", institutionId: "inst-a", slug: "react" },
  { id: "c-legacy", institutionId: null, slug: "react" },
];
const modules = [{ id: "m-a", courseId: "c-a" }];
const lessons = [{ id: "l-a", moduleId: "m-a", courseInstitutionId: "inst-a" }];
const matches = (row: any, where: any) => Object.entries(where).every(([k, v]: any) => (v && typeof v === "object" && "in" in v ? v.in.includes(row[k]) : v && typeof v === "object" && "not" in v ? row[k] !== v.not : row[k] === v));
const fake: any = {
  institution: { findUnique: async ({ where }: any) => (where.slug === "acme" ? { id: "inst-a" } : null) },
  course: {
    findFirst: async ({ where }: any) => courses.find((c) => matches(c, where)) ?? null,
    count: async ({ where }: any) => courses.filter((c) => matches(c, where)).length,
  },
  category: { findFirst: async () => null },
  courseModule: { findFirst: async ({ where }: any) => modules.find((m) => matches(m, where)) ?? null },
  lesson: {
    findFirst: async ({ where }: any) =>
      lessons.find((l) => (where.id ? l.id === where.id : true) && (where.moduleId ? l.moduleId === where.moduleId : true) && (where.module ? l.courseInstitutionId === where.module.course.institutionId : true)) ?? null,
  },
  lessonResource: { findFirst: async () => null },
};

describe("tenancy helpers", () => {
  it("resolves the tenant: user first, then ?institution=, else legacy", async () => {
    expect(tenantOf({ institutionId: "inst-a" })).toBe("inst-a");
    expect(tenantOf(null)).toBeNull();
    expect(await resolvePublicTenant(fake, { userId: "u", email: "e", role: "STUDENT", institutionId: "inst-b" }, "acme")).toBe("inst-b");
    expect(await resolvePublicTenant(fake, undefined, "acme")).toBe("inst-a");
    expect(await resolvePublicTenant(fake, undefined, undefined)).toBeNull();
    await expect(resolvePublicTenant(fake, undefined, "nope")).rejects.toThrow(NotFoundException);
  });

  it("only finds courses of the same workspace", async () => {
    await expect(findCourseInTenant(fake, "inst-a", "c-a")).resolves.toMatchObject({ id: "c-a" });
    await expect(findCourseInTenant(fake, null, "c-a")).rejects.toThrow("Course not found");
    await expect(findCourseInTenant(fake, "inst-b", "c-legacy")).rejects.toThrow(NotFoundException);
    await expect(assertCoursesInTenant(fake, "inst-a", ["c-a", "c-a"])).resolves.toBeUndefined();
    await expect(assertCoursesInTenant(fake, "inst-a", ["c-a", "c-legacy"])).rejects.toThrow(NotFoundException);
  });

  it("checks slugs per workspace (including the legacy null tenant)", async () => {
    await expect(assertSlugFree(fake, "course", "inst-a", "react")).rejects.toThrow(ConflictException);
    await expect(assertSlugFree(fake, "course", "inst-a", "react", "c-a")).resolves.toBeUndefined();
    await expect(assertSlugFree(fake, "course", null, "react")).rejects.toThrow(ConflictException);
    await expect(assertSlugFree(fake, "course", "inst-b", "react")).resolves.toBeUndefined();
  });
});

describe("CatalogAccessGuard", () => {
  const ctx = (params: Record<string, string>, institutionId: string | null) =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ params, user: { institutionId } }) }),
      getHandler: () => null,
      getClass: () => null,
    }) as any;
  const guard = (kind?: string) => new CatalogAccessGuard(fake, { getAllAndOverride: () => kind } as any);

  it("allows the right workspace and hierarchy", async () => {
    await expect(guard("module").canActivate(ctx({ courseId: "c-a", id: "m-a" }, "inst-a"))).resolves.toBe(true);
    await expect(guard("lesson").canActivate(ctx({ courseId: "c-a", moduleId: "m-a", id: "l-a" }, "inst-a"))).resolves.toBe(true);
  });

  it("404s other workspaces and mismatched parents", async () => {
    await expect(guard("module").canActivate(ctx({ courseId: "c-a", id: "m-a" }, "inst-b"))).rejects.toThrow("Course not found");
    await expect(guard("module").canActivate(ctx({ courseId: "c-legacy", id: "m-a" }, null))).rejects.toThrow("Module not found");
    await expect(guard().canActivate(ctx({ lessonId: "l-a" }, "inst-b"))).rejects.toThrow("Lesson not found");
  });
});
