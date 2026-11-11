import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, UnauthorizedException } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { randomInt } from "crypto";
import { AuthService } from "../../auth/auth.service";
import { MailService } from "../../auth/mail/mail.service";
import { PlanAccessService } from "../../plan-access/plan-access.service";
import { PrismaService } from "../../prisma/prisma.service";
import { SecurityPolicyService } from "../../workspace-settings/security-policy.service";
import { ONLINE_STATUSES } from "../academy-site.mapper";
import type { LearnerEmailDto, LearnerLoginDto, LearnerRegisterDto, LearnerVerifyDto } from "./learner.dto";

export interface LearnerSession {
  token: string;
  user: { id: string; name: string; email: string; avatar: string | null };
}

const NOT_HERE = "No learner account with these details at this academy.";

/**
 * Learner accounts on an academy's own website. A learner is a STUDENT user of exactly one institution
 * (emails are unique platform-wide). Sign-up sends a 6-digit code; confirming it signs the learner in, so
 * checkout can continue without a second step.
 */
@Injectable()
export class LearnerAuthService {
  private readonly logger = new Logger(LearnerAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly mail: MailService,
    private readonly security: SecurityPolicyService,
    private readonly plans: PlanAccessService,
  ) {}

  /** Online academy by slug (404 / 403 ACADEMY_UNAVAILABLE). */
  async academy(slug: string) {
    const inst = await this.prisma.institution.findUnique({ where: { slug: slug.trim().toLowerCase() }, select: { id: true, name: true, status: true } });
    if (!inst) throw new NotFoundException("Academy not found");
    if (!ONLINE_STATUSES.has(inst.status)) throw new ForbiddenException({ code: "ACADEMY_UNAVAILABLE", message: "This academy is temporarily unavailable." });
    return inst;
  }

  private code() {
    return String(randomInt(100000, 1000000));
  }

  private async sendCode(email: string, name: string, code: string, academyName: string) {
    try {
      await this.mail.sendAcademyVerificationCode(email, name, code, academyName);
    } catch (err: any) {
      this.logger.error(`Verification email to ${email} failed: ${err?.message ?? err}`);
    }
  }

  async register(slug: string, dto: LearnerRegisterDto) {
    const inst = await this.academy(slug);
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email }, select: { id: true, institutionId: true, role: true, emailVerified: true, deletedAt: true } });
    const unfinished = existing && existing.institutionId === inst.id && existing.role === "STUDENT" && !existing.emailVerified && !existing.deletedAt;
    if (existing && !unfinished) throw new ConflictException("An account with this email already exists. Sign in instead.");

    await this.security.assertPassword(inst.id, dto.password);
    if (!existing) {
      await this.plans.assertCanAdd(inst.id, "students").catch(() => {
        throw new ForbiddenException("This academy isn't accepting new sign-ups right now. Please contact the academy.");
      });
    }

    const code = this.code();
    const data = { name: dto.name, password: await bcrypt.hash(dto.password, 10), verificationToken: code, passwordChangedAt: new Date() };
    if (unfinished) await this.prisma.user.update({ where: { id: existing.id }, data });
    else await this.prisma.user.create({ data: { ...data, email: dto.email, role: "STUDENT", status: "PENDING", emailVerified: false, institutionId: inst.id } });

    await this.sendCode(dto.email, dto.name, code, inst.name);
    return { email: dto.email, message: "We sent a 6-digit code to your email." };
  }

  async resend(slug: string, dto: LearnerEmailDto) {
    const inst = await this.academy(slug);
    const user = await this.prisma.user.findFirst({ where: { email: dto.email, institutionId: inst.id, role: "STUDENT", emailVerified: false, deletedAt: null }, select: { id: true, name: true } });
    // Same answer whether or not the account exists (no account probing).
    if (user) {
      const code = this.code();
      await this.prisma.user.update({ where: { id: user.id }, data: { verificationToken: code } });
      await this.sendCode(dto.email, user.name, code, inst.name);
    }
    return { message: "If that account is waiting for confirmation, a new code is on its way." };
  }

  async verify(slug: string, dto: LearnerVerifyDto, ip?: string): Promise<LearnerSession> {
    const inst = await this.academy(slug);
    const user = await this.prisma.user.findFirst({ where: { email: dto.email, institutionId: inst.id, role: "STUDENT", deletedAt: null } });
    if (!user || user.emailVerified || !user.verificationToken || user.verificationToken !== dto.code) {
      throw new BadRequestException("That code isn't right or has expired. Check your email or send a new code.");
    }
    const active = await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, status: user.status === "PENDING" ? "ACTIVE" : user.status, verificationToken: null },
    });
    const { token } = await this.auth.issueSession(active, ip);
    return { token, user: { id: active.id, name: active.name, email: active.email, avatar: active.avatar } };
  }

  async login(slug: string, dto: LearnerLoginDto, ip?: string): Promise<LearnerSession> {
    const inst = await this.academy(slug);
    const user = await this.prisma.user.findUnique({ where: { email: dto.email }, select: { id: true, name: true, email: true, avatar: true, role: true, institutionId: true, emailVerified: true } });
    // Staff and other academies' learners sign in elsewhere; answer like a wrong password.
    if (!user || user.institutionId !== inst.id || user.role !== "STUDENT") throw new UnauthorizedException(NOT_HERE);
    if (!user.emailVerified) {
      if (!(await this.passwordMatches(user.id, dto.password))) throw new UnauthorizedException(NOT_HERE);
      throw new UnauthorizedException({ statusCode: 401, code: "EMAIL_NOT_VERIFIED", message: "Please confirm your email first — we can send you a new code." });
    }
    const res = await this.auth.login({ email: dto.email, password: dto.password }, ip);
    if (!("token" in res) || !res.token) throw new UnauthorizedException("Two-step sign-in isn't available for learner accounts yet. Contact the academy.");
    return { token: res.token, user: { id: user.id, name: user.name, email: user.email, avatar: user.avatar } };
  }

  private async passwordMatches(userId: string, password: string) {
    const row = await this.prisma.user.findUnique({ where: { id: userId }, select: { password: true } });
    return !!row && (await bcrypt.compare(password, row.password));
  }

  /** The signed-in learner, if they belong to this academy. */
  async me(slug: string, userId: string) {
    const inst = await this.academy(slug);
    const user = await this.prisma.user.findFirst({ where: { id: userId, institutionId: inst.id, role: "STUDENT", deletedAt: null }, select: { id: true, name: true, email: true, avatar: true } });
    if (!user) throw new UnauthorizedException("Please sign in again.");
    return user;
  }
}
