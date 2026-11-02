import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { DEFAULT_PLANS } from "./saas.constants";
import { CustomDomainDto } from "./dto/subscription.dto";
import { CreateInstitutionDto } from "./dto/institution.dto";
import { PlanDto } from "./dto/plan.dto";
import { SignupDto } from "./dto/signup.dto";
import { addMonthsUtc, planChangePreview, sortPlans, taxFor } from "./saas.math";
import type { InstitutionView, PlanView } from "./saas.types";

const plans: PlanView[] = DEFAULT_PLANS.map((p) => ({
  id: p.id,
  name: p.name,
  tagline: p.tagline,
  priceMonthly: p.priceMonthly,
  priceYearly: p.priceYearly,
  limits: { students: p.limitStudents, courses: p.limitCourses, teamMembers: p.limitTeamMembers, storageGb: p.limitStorageGb },
  features: p.features,
  highlighted: p.highlighted,
  isPublic: p.isPublic,
  trialDays: p.trialDays,
  archived: false,
  updatedAt: new Date().toISOString(),
}));

const DAY = 86_400_000;
function inst(overrides: Partial<InstitutionView["subscription"]> = {}, usage: Partial<InstitutionView["usage"]> = {}): InstitutionView {
  const now = Date.now();
  return {
    id: "i1",
    name: "Test",
    slug: "test",
    logoInitials: "TE",
    tone: "orange",
    type: "SCHOOL",
    country: "Bangladesh",
    ownerName: "Owner",
    ownerEmail: "o@test.com",
    phone: "",
    createdAt: new Date(now).toISOString(),
    lastActiveAt: new Date(now).toISOString(),
    subscription: {
      planId: "starter",
      cycle: "MONTHLY",
      status: "ACTIVE",
      startedAt: new Date(now - 15 * DAY).toISOString(),
      trialEndsAt: null,
      currentPeriodStart: new Date(now - 15 * DAY).toISOString(),
      currentPeriodEnd: new Date(now + 15 * DAY).toISOString(),
      cancelAtPeriodEnd: false,
      cancelledAt: null,
      suspendedAt: null,
      suspendedReason: null,
      statusBeforeSuspend: null,
      customPrice: null,
      paymentMethod: null,
      ...overrides,
    },
    customDomain: null,
    usage: { students: 10, courses: 2, teamMembers: 1, storageGb: 1, ...usage },
    notes: "",
    source: "OWNER_CREATED",
  };
}

const errorsOf = (cls: any, body: object) =>
  validateSync(plainToInstance(cls, body), { whitelist: true }).flatMap((e) => [
    ...Object.values(e.constraints ?? {}),
    ...(e.children ?? []).flatMap((c) => Object.values(c.constraints ?? {})),
  ]);

describe("saas.math", () => {
  it("sorts plans by monthly price with custom-priced last", () => {
    expect(sortPlans([...plans].reverse()).map((p) => p.id)).toEqual(["starter", "growth", "pro", "enterprise"]);
  });

  it("clamps month ends when adding months", () => {
    expect(addMonthsUtc(new Date("2026-01-31T10:00:00Z"), 1).toISOString()).toBe("2026-02-28T10:00:00.000Z");
    expect(addMonthsUtc(new Date("2024-01-31T00:00:00Z"), 1).toISOString()).toBe("2024-02-29T00:00:00.000Z");
  });

  it("applies country tax", () => {
    expect(taxFor("Bangladesh", 79)).toBe(3.95);
    expect(taxFor("United States", 79)).toBe(0);
  });

  it("prorates an upgrade halfway through the period", () => {
    const p = planChangePreview(plans, inst(), "growth", "MONTHLY");
    expect(p.kind).toBe("UPGRADE");
    expect(p.dueNow).toBeCloseTo(25, 0); // (79 − 29) × ~0.5
    expect(p.resetsPeriod).toBe(false);
  });

  it("charges new price minus credit on a cycle switch", () => {
    const p = planChangePreview(plans, inst(), "starter", "YEARLY");
    expect(p.kind).toBe("CYCLE");
    expect(p.resetsPeriod).toBe(true);
    expect(p.dueNow).toBeCloseTo(290 - 14.5, 0);
  });

  it("blocks downgrades that exceed limits and never charges trials", () => {
    const big = inst({ planId: "pro" }, { students: 4000 });
    expect(planChangePreview(plans, big, "growth", "MONTHLY").blockers).toEqual([{ key: "students", usage: 4000, limit: 1000 }]);
    const trial = inst({ status: "TRIALING" });
    expect(planChangePreview(plans, trial, "pro", "YEARLY").dueNow).toBe(0);
  });
});

describe("saas DTOs", () => {
  const validInstitution = {
    name: "Dhaka Coding Academy",
    type: "COACHING",
    country: "Bangladesh",
    ownerName: "Rahim Uddin",
    ownerEmail: "  Rahim@Example.com ",
    phone: "",
    slug: "dhaka-coding",
    planId: "growth",
    cycle: "MONTHLY",
    startWithTrial: true,
    trialDays: 14,
    notes: "",
  };

  it("accepts a valid institution and normalises email", () => {
    const dto = plainToInstance(CreateInstitutionDto, validInstitution);
    expect(validateSync(dto)).toHaveLength(0);
    expect(dto.ownerEmail).toBe("rahim@example.com");
  });

  it("rejects reserved / malformed slugs with friendly messages", () => {
    expect(errorsOf(CreateInstitutionDto, { ...validInstitution, slug: "admin" })).toContain("This subdomain is reserved — choose another");
    expect(errorsOf(CreateInstitutionDto, { ...validInstitution, slug: "-bad-" })).toContain(
      "Use lowercase letters, numbers and hyphens (not at the start or end)",
    );
  });

  it("validates plan limits (int ≥ 1 or null)", () => {
    const plan = { name: "Team", tagline: "For teams", priceMonthly: 49, priceYearly: 490, features: ["community"], highlighted: false, isPublic: true, trialDays: 14 };
    expect(errorsOf(PlanDto, { ...plan, limits: { students: null, courses: 5, teamMembers: 2, storageGb: 10 } })).toHaveLength(0);
    expect(errorsOf(PlanDto, { ...plan, limits: { students: 0, courses: 5, teamMembers: 2, storageGb: 10 } })).toContain("Students limit must be at least 1");
    expect(errorsOf(PlanDto, { ...plan, features: ["nope"], limits: { students: null, courses: null, teamMembers: null, storageGb: null } })).toContain("Unknown feature");
  });

  it("normalises custom domains", () => {
    const dto = plainToInstance(CustomDomainDto, { domain: " HTTPS://Learn.MySchool.com/path " });
    expect(validateSync(dto)).toHaveLength(0);
    expect(dto.domain).toBe("learn.myschool.com");
  });

  it("requires terms + a strong password on signup", () => {
    const errs = errorsOf(SignupDto, {
      name: "Rahim",
      email: "r@example.com",
      password: "password",
      institutionName: "Rahim School",
      type: "SCHOOL",
      country: "Bangladesh",
      slug: "rahim-school",
      planId: "starter",
      cycle: "MONTHLY",
      agreeTerms: false,
    });
    expect(errs).toContain("Include at least one number");
    expect(errs).toContain("You must accept the Terms of Service and Privacy Policy");
  });
});
