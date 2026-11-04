import { PlanAccessService } from "../../plan-access/plan-access.service";
import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import type { Prisma } from "../../../generated/prisma";
import { MailService } from "../../auth/mail/mail.service";
import { CouponRedemptionsService } from "../coupons/services/coupon-redemptions.service";
import type { CouponRedemptionView } from "../coupons/coupons.types";
import type { CreateInstitutionDto, UpdateInstitutionDto } from "../dto/institution.dto";
import type { SignupDto } from "../dto/signup.dto";
import { INSTITUTION_ADMIN_ROLE, isReservedSlug, MAX_EVENTS_IN_SNAPSHOT, SAAS_ROOT_DOMAIN, SAAS_TRIAL_DAYS, SLUG_REGEX, TONES } from "../saas.constants";
import { toEventView, toInstitutionView, toInvoiceView } from "../saas.mapper";
import { cycleLabel, DAY_MS, initialsOf, periodEndFrom, priceFor, sortPlans } from "../saas.math";
import type { BillingCycle, EventView, InstitutionView, InvoiceView, SaasActorKind, SaasSnapshot } from "../saas.types";
import { SaasCoreService, type Tx } from "./saas-core.service";

type BaseValues = {
  name: string;
  type: CreateInstitutionDto["type"];
  country: string;
  ownerName: string;
  ownerEmail: string;
  phone: string;
  slug: string;
  planId: string;
  cycle: BillingCycle;
  notes: string;
};

export type SlugCheck = { available: true } | { available: false; reason: string };

/** Institutions (tenants): snapshot / list / detail, create, edit, notes, impersonation and public self-signup. */
@Injectable()
export class SaasInstitutionsService {
  private readonly logger = new Logger(SaasInstitutionsService.name);

  constructor(
    private readonly core: SaasCoreService,
    private readonly jwt: JwtService,
    private readonly mail: MailService,
    private readonly coupons: CouponRedemptionsService,
    private readonly planAccess: PlanAccessService,
  ) {}

  private get prisma() {
    return this.core.prisma;
  }

  // ---------------------------------------------------------------- reads

  /** Whole SaaS state in the frontend `SaasStore` shape — the console computes its stats from this. */
  async snapshot(): Promise<SaasSnapshot> {
    const [plans, institutions, invoices, events] = await Promise.all([
      this.core.plans(),
      this.prisma.institution.findMany({ include: { customDomain: true }, orderBy: { createdAt: "desc" } }),
      this.prisma.saasInvoice.findMany({ orderBy: { issuedAt: "desc" } }),
      this.prisma.saasEvent.findMany({ orderBy: { at: "desc" }, take: MAX_EVENTS_IN_SNAPSHOT }),
    ]);
    return {
      plans: sortPlans(plans),
      institutions: institutions.map(toInstitutionView),
      invoices: invoices.map(toInvoiceView),
      events: events.map(toEventView),
    };
  }

  async list(): Promise<InstitutionView[]> {
    const rows = await this.prisma.institution.findMany({ include: { customDomain: true }, orderBy: { createdAt: "desc" } });
    return rows.map(toInstitutionView);
  }

  /** Institution + its invoices + timeline (detail page / institution billing page). */
  async detail(id: string): Promise<{ institution: InstitutionView; invoices: InvoiceView[]; events: EventView[] }> {
    await this.core.mustInstitution(this.prisma, id);
    await this.planAccess.refreshUsage(id); // usage bars always show real counts
    const institution = await this.core.mustInstitution(this.prisma, id);
    const [invoices, events] = await Promise.all([
      this.prisma.saasInvoice.findMany({ where: { institutionId: id }, orderBy: { issuedAt: "desc" } }),
      this.prisma.saasEvent.findMany({ where: { institutionId: id }, orderBy: { at: "desc" }, take: 500 }),
    ]);
    return { institution, invoices: invoices.map(toInvoiceView), events: events.map(toEventView) };
  }

  async events(institutionId?: string, limit = 200): Promise<EventView[]> {
    const rows = await this.prisma.saasEvent.findMany({ where: institutionId ? { institutionId } : {}, orderBy: { at: "desc" }, take: limit });
    return rows.map(toEventView);
  }

  // ---------------------------------------------------------------- slugs

  private async slugTaken(tx: Tx, slug: string, exceptId?: string) {
    const hit = await tx.institution.findUnique({ where: { slug }, select: { id: true } });
    return !!hit && hit.id !== exceptId;
  }

  async checkSlug(raw: string, exceptId?: string): Promise<SlugCheck> {
    const s = raw.trim().toLowerCase();
    if (!SLUG_REGEX.test(s)) return { available: false, reason: "Use 3–32 lowercase letters, numbers or hyphens" };
    if (isReservedSlug(s)) return { available: false, reason: "This subdomain is reserved" };
    if (await this.slugTaken(this.prisma, s, exceptId)) return { available: false, reason: `${s}.${SAAS_ROOT_DOMAIN} is already taken` };
    return { available: true };
  }

  // ---------------------------------------------------------------- create

  private async build(tx: Tx, v: BaseValues, trialDays: number | null, source: "SELF_SIGNUP" | "OWNER_CREATED") {
    const slug = v.slug.trim().toLowerCase();
    if (isReservedSlug(slug)) throw new BadRequestException("This subdomain is reserved — choose another.");
    if (await this.slugTaken(tx, slug)) throw new ConflictException(`${slug}.${SAAS_ROOT_DOMAIN} is already taken — choose another subdomain.`);
    const email = v.ownerEmail.trim().toLowerCase();
    const emailClash = await tx.institution.count({ where: { ownerEmail: email, status: { not: "CANCELLED" } } });
    if (emailClash) throw new ConflictException("An active institution already uses this owner email.");
    await this.core.mustPlan(tx, v.planId);

    const now = new Date();
    const trialEndsAt = trialDays ? new Date(now.getTime() + trialDays * DAY_MS) : null;
    const count = await tx.institution.count();
    const row = await tx.institution.create({
      data: {
        name: v.name.trim(),
        slug,
        logoInitials: initialsOf(v.name),
        tone: TONES[count % TONES.length]!,
        type: v.type,
        country: v.country,
        ownerName: v.ownerName.trim(),
        ownerEmail: email,
        phone: v.phone.trim(),
        notes: v.notes.trim(),
        source,
        planId: v.planId,
        cycle: v.cycle,
        status: trialDays ? "TRIALING" : "ACTIVE",
        startedAt: now,
        trialEndsAt,
        currentPeriodStart: now,
        currentPeriodEnd: trialEndsAt ?? periodEndFrom(now, v.cycle),
      },
      include: { customDomain: true },
    });
    return toInstitutionView(row);
  }

  /** Owner creates an institution. Without a trial an OPEN first invoice is issued. */
  async create(v: CreateInstitutionDto): Promise<InstitutionView> {
    return this.core.tx(async (tx) => {
      const inst = await this.build(tx, v, v.startWithTrial ? v.trialDays : null, "OWNER_CREATED");
      const plan = await this.core.mustPlan(tx, v.planId);
      await this.core.event(tx, inst.id, "SIGNED_UP", `Institution created by the platform owner (${inst.slug}.${SAAS_ROOT_DOMAIN})`, "Owner");
      if (v.startWithTrial) {
        await this.core.event(tx, inst.id, "TRIAL_STARTED", `${v.trialDays}-day free trial started on ${plan.name}`, "System");
      } else {
        const amount = priceFor(plan, v.cycle);
        if (amount > 0)
          await this.core.addInvoice(tx, inst, {
            planId: plan.id,
            cycle: v.cycle,
            amount,
            periodStart: new Date(inst.subscription.currentPeriodStart),
            periodEnd: new Date(inst.subscription.currentPeriodEnd),
            paid: false,
            description: `${plan.name} plan — ${cycleLabel(v.cycle)} subscription`,
          });
      }
      if (inst.notes) await this.core.event(tx, inst.id, "NOTE", inst.notes, "Owner");
      return this.core.mustInstitution(tx, inst.id);
    });
  }

  /**
   * Public self-signup: creates a TRIALING institution (plan trial length) and its ADMIN user (PENDING until the
   * 6-digit email code is verified via POST /auth/verify-email — same flow as normal registration).
   * Trial length: the plan's, else Console settings › Trials › default trial days. An optional `couponCode`
   * is redeemed in the same transaction (an invalid code rejects the signup with the coupon message).
   */
  async signup(v: SignupDto): Promise<{ institution: InstitutionView; coupon: CouponRedemptionView | null; email: string; message: string }> {
    const hashed = await bcrypt.hash(v.password, 10);
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const { institution, coupon } = await this.core.tx(async (tx) => {
      const plan = await this.core.mustPlan(tx, v.planId);
      if (plan.archived || !plan.isPublic) throw new BadRequestException("This plan isn't available for self-signup.");
      const existingUser = await tx.user.findFirst({ where: { email: { equals: v.email, mode: "insensitive" } }, select: { id: true } });
      if (existingUser) throw new ConflictException("An account with this email already exists — sign in instead.");
      const trialDays = plan.trialDays || (await this.core.trialSettings(tx)).defaultTrialDays || SAAS_TRIAL_DAYS;
      const inst = await this.build(
        tx,
        { name: v.institutionName, type: v.type, country: v.country, ownerName: v.name, ownerEmail: v.email, phone: "", slug: v.slug, planId: v.planId, cycle: v.cycle, notes: "" },
        trialDays,
        "SELF_SIGNUP",
      );
      await tx.user.create({
        data: { name: v.name, email: v.email, password: hashed, role: INSTITUTION_ADMIN_ROLE, status: "PENDING", verificationToken: otp, institutionId: inst.id },
      });
      await this.core.event(tx, inst.id, "SIGNED_UP", `${inst.name} signed up at ${inst.slug}.${SAAS_ROOT_DOMAIN}`, "Institution");
      await this.core.event(tx, inst.id, "TRIAL_STARTED", `${trialDays}-day free trial started on ${plan.name}`, "System");
      const coupon = v.couponCode ? await this.coupons.redeem(tx, v.couponCode, { institutionId: inst.id, planId: plan.id, cycle: v.cycle, actor: "Institution" }) : null;
      return { institution: inst, coupon };
    });
    try {
      await this.mail.sendVerificationEmail(v.email, otp);
    } catch (err: any) {
      this.logger.warn(`Signup verification email failed for ${v.email}: ${err?.message ?? err}`);
    }
    return { institution, coupon, email: v.email, message: "Workspace created. Check your email for the 6-digit verification code." };
  }

  // ---------------------------------------------------------------- edit

  async update(id: string, patch: UpdateInstitutionDto): Promise<InstitutionView> {
    return this.core.tx(async (tx) => {
      const before = await this.core.mustInstitution(tx, id);
      if (patch.slug !== undefined && (await this.slugTaken(tx, patch.slug, id)))
        throw new ConflictException(`${patch.slug}.${SAAS_ROOT_DOMAIN} is already taken — choose another subdomain.`);
      const data: Prisma.InstitutionUpdateInput = { ...patch };
      if (patch.name) data.logoInitials = initialsOf(patch.name);
      await tx.institution.update({ where: { id }, data });
      const after = await this.core.mustInstitution(tx, id);

      const keys = Object.keys(patch) as (keyof UpdateInstitutionDto)[];
      const changed = keys.filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
      if (patch.slug && patch.slug !== before.slug)
        await this.core.event(tx, id, "NOTE", `Subdomain changed ${before.slug}.${SAAS_ROOT_DOMAIN} → ${after.slug}.${SAAS_ROOT_DOMAIN}`, "Owner");
      else if (changed.length === 1 && changed[0] === "notes") await this.core.event(tx, id, "NOTE", "Internal notes updated", "Owner");
      else if (changed.length) await this.core.event(tx, id, "NOTE", `Details updated (${changed.join(", ")})`, "Owner");
      return after;
    });
  }

  async addNote(id: string, note: string): Promise<EventView> {
    return this.core.tx(async (tx) => {
      await this.core.mustInstitution(tx, id);
      return toEventView(await this.core.event(tx, id, "NOTE", note, "Owner"));
    });
  }

  // ---------------------------------------------------------------- impersonation

  /**
   * "Open as owner": a 1-hour ADMIN token scoped to the institution (claim `impersonatedBy` = platform owner).
   * Acts as the institution's first admin user when one exists.
   */
  async impersonate(id: string, owner: { userId: string; email: string }, actor: SaasActorKind = "Owner") {
    const inst = await this.core.mustInstitution(this.prisma, id);
    if (inst.subscription.status === "CANCELLED") throw new ForbiddenException("This institution's workspace is closed.");
    const admin = await this.prisma.user.findFirst({ where: { institutionId: id, role: INSTITUTION_ADMIN_ROLE }, orderBy: { createdAt: "asc" } });
    const token = this.jwt.sign(
      { sub: admin?.id ?? owner.userId, email: admin?.email ?? owner.email, role: INSTITUTION_ADMIN_ROLE, institutionId: id, impersonatedBy: owner.userId },
      { expiresIn: "1h" },
    );
    await this.core.event(this.prisma, id, "NOTE", "Platform owner opened the institution panel (impersonation)", actor);
    return { token, expiresIn: 3600, institution: inst };
  }

  /** Resolves the tenant of an authenticated institution user (impersonation tokens carry it directly). */
  async institutionIdFor(user: { userId: string; institutionId?: string | null }): Promise<string> {
    if (user.institutionId) return user.institutionId;
    const row = await this.prisma.user.findUnique({ where: { id: user.userId }, select: { institutionId: true } });
    if (!row?.institutionId) throw new NotFoundException("Your account isn't linked to an institution.");
    return row.institutionId;
  }
}
