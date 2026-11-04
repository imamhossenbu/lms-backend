import { ForbiddenException } from "@nestjs/common";
import { PlanAccessService } from "./plan-access.service";

/** In-memory Prisma stand-in: one Starter workspace (3 seats, 200 students) and a Growth plan with live classes. */
function fakePrisma(state: { status: string; students: number; staff: number; teachers: number }) {
  const starter = { id: "starter", name: "Starter", tagline: "", priceMonthly: 29, priceYearly: 290, limitStudents: 200, limitCourses: 20, limitTeamMembers: 3, limitStorageGb: 10, features: ["community"], highlighted: false, isPublic: true, trialDays: 14, archived: false, updatedAt: new Date() };
  const growth = { ...starter, id: "growth", name: "Growth", priceMonthly: 79, features: ["community", "liveClasses"] };
  return {
    institution: {
      findUnique: async ({ select }: any) => (select?.plan ? { status: state.status, usageStorageGb: 0, plan: starter } : { usageStorageGb: 0 }),
      updateMany: async () => ({ count: 1 }),
    },
    saasPlan: { findMany: async () => [growth, starter] },
    user: { count: async ({ where }: any) => (where.role === "STUDENT" ? state.students : state.teachers) },
    course: { count: async () => 4 },
    teamMember: { count: async () => state.staff },
  } as any;
}

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "ok";
  } catch (e) {
    return e instanceof ForbiddenException ? (e.getResponse() as any).code : String(e);
  }
};

describe("PlanAccessService", () => {
  it("never gates the legacy workspace", async () => {
    const svc = new PlanAccessService(fakePrisma({ status: "ACTIVE", students: 999, staff: 9, teachers: 9 }));
    expect(await code(svc.assertFeature(null, "liveClasses"))).toBe("ok");
    expect(await code(svc.assertCanAdd(null, "students"))).toBe("ok");
  });

  it("requires plan features and names the cheapest plan that has it", async () => {
    const svc = new PlanAccessService(fakePrisma({ status: "ACTIVE", students: 0, staff: 1, teachers: 0 }));
    expect(await code(svc.assertFeature("t", "community"))).toBe("ok");
    expect(await code(svc.assertFeature("t", "liveClasses"))).toBe("PLAN_FEATURE_REQUIRED");
    await svc.assertFeature("t", "liveClasses").catch((e) => {
      expect((e.getResponse() as any).requiredPlanId).toBe("growth");
      expect(e.message).toContain("Upgrade to Growth");
    });
  });

  it("enforces limits on live counts (seats = team members + instructors)", async () => {
    const svc = new PlanAccessService(fakePrisma({ status: "ACTIVE", students: 199, staff: 2, teachers: 0 }));
    expect(await code(svc.assertCanAdd("t", "students"))).toBe("ok"); // 199 + 1 = 200
    expect(await code(svc.assertCanAdd("t", "students", 2))).toBe("PLAN_LIMIT_REACHED");
    expect(await code(svc.assertCanAdd("t", "teamMembers"))).toBe("ok"); // 2 + 1 = 3
    expect(await code(svc.assertCanAdd("t", "teamMembers", 2))).toBe("PLAN_LIMIT_REACHED");
    expect(await svc.usage("t")).toEqual({ students: 199, courses: 4, teamMembers: 2, storageGb: 0 });
  });

  it("blocks suspended / cancelled workspaces", async () => {
    const svc = new PlanAccessService(fakePrisma({ status: "SUSPENDED", students: 0, staff: 1, teachers: 0 }));
    expect(await code(svc.assertFeature("t", "community"))).toBe("WORKSPACE_INACTIVE");
    expect(await code(svc.assertCanAdd("t", "courses"))).toBe("WORKSPACE_INACTIVE");
    expect(await svc.hasFeature("t", "community")).toBe(false);
  });
});
