import { BadRequestException, ConflictException, GoneException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as bcrypt from "bcrypt";
import { MailService } from "../../auth/mail/mail.service";
import { BCRYPT_ROUNDS } from "../../common/accounts";
import { randomToken, sha256 } from "../../common/crypto";
import type { AcceptInviteDto, InviteMembersDto } from "../dto/team.dto";
import { countPermissions, normalizeExtras } from "../team-permissions";
import { assertCanGrant, plural } from "../team.rules";
import type { TeamMemberView } from "../team.types";
import { memberInclude, rolePermissions, STAFF_ROLE, TeamAccessService, toMemberView, type ActorContext, type Tx } from "./team-access.service";
import { PlanAccessService } from "../../plan-access/plan-access.service";
import { SecurityPolicyService } from "../../workspace-settings/security-policy.service";

export const INVITE_EXPIRY_DAYS = 7;
const DAY_MS = 86_400_000;

interface OutgoingInvite {
  email: string;
  token: string;
  roleName: string;
  message: string;
  expiresAt: Date;
}

/**
 * Team invitations. The link carries a random token; only its SHA-256 is stored, so a database leak
 * can't be turned into working invitations. Emails are sent after the transaction commits.
 */
@Injectable()
export class TeamInvitesService {
  private readonly logger = new Logger(TeamInvitesService.name);

  constructor(
    private readonly access: TeamAccessService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly plans: PlanAccessService,
    private readonly securityPolicy: SecurityPolicyService,
  ) {}

  private get prisma() {
    return this.access.prisma;
  }

  private async workspaceName(tenantId: string | null) {
    if (!tenantId) return "EduPro";
    return (await this.prisma.institution.findUnique({ where: { id: tenantId }, select: { name: true } }))?.name ?? "EduPro";
  }

  private async send(ctx: Pick<ActorContext, "name" | "tenantId">, invites: OutgoingInvite[]) {
    const base = this.config.get<string>("FRONTEND_URL") || "http://localhost:3000";
    const workspace = await this.workspaceName(ctx.tenantId);
    for (const inv of invites) {
      try {
        await this.mail.sendTeamInviteEmail(inv.email, ctx.name, workspace, inv.roleName, inv.message, `${base}/accept-invite?token=${inv.token}`, inv.expiresAt);
      } catch (err: any) {
        this.logger.warn(`Invitation email to ${inv.email} failed: ${err?.message ?? err}`);
      }
    }
  }

  /**
   * An email can be invited unless it's already on this team, or belongs to another kind of account
   * (student, instructor, another workspace). Former staff of this workspace (removed) can be re-invited.
   */
  private async assertInvitable(tx: Tx, ctx: ActorContext, email: string) {
    if (await tx.teamMember.findFirst({ where: { institutionId: ctx.tenantId, email }, select: { id: true } }))
      throw new ConflictException(`${email} is already on the team or invited.`);
    const user = await tx.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { role: true, institutionId: true, deletedAt: true } });
    if (user && (user.deletedAt || user.role !== STAFF_ROLE || (user.institutionId ?? null) !== ctx.tenantId))
      throw new ConflictException(`${email} already belongs to another account and can't be invited to the team.`);
  }

  async invite(ctx: ActorContext, dto: InviteMembersDto): Promise<TeamMemberView[]> {
    const emails = [...new Set(dto.emails)];
    await this.plans.assertCanAdd(ctx.tenantId, "teamMembers", emails.length);
    const outgoing: OutgoingInvite[] = [];

    const created = await this.prisma.$transaction(async (tx) => {
      const role = await this.access.mustRole(tx, ctx, dto.roleId);
      if (role.isLocked) throw new BadRequestException("Super Admin can't be assigned by invitation.");
      const base = rolePermissions(role);
      const extras = normalizeExtras(dto.extraPermissions, base);
      assertCanGrant(ctx, base);
      assertCanGrant(ctx, extras);

      const now = new Date();
      const expiresAt = new Date(now.getTime() + INVITE_EXPIRY_DAYS * DAY_MS);
      const ids: string[] = [];
      for (const email of emails) {
        await this.assertInvitable(tx, ctx, email);
        const token = randomToken();
        const m = await tx.teamMember.create({
          data: {
            institutionId: ctx.tenantId,
            email,
            roleId: role.id,
            extraPermissions: extras,
            status: "INVITED",
            inviteTokenHash: sha256(token),
            inviteSentAt: now,
            inviteExpiresAt: expiresAt,
            inviteMessage: dto.message,
            invitedById: ctx.userId,
          },
        });
        ids.push(m.id);
        outgoing.push({ email, token, roleName: role.name, message: dto.message, expiresAt });
        const extraNote = countPermissions(extras) ? ` + ${plural(countPermissions(extras), "extra permission")}` : "";
        await this.access.event(tx, ctx, "INVITED", m.id, email, `as ${role.name}${extraNote}`);
      }
      return tx.teamMember.findMany({ where: { id: { in: ids } }, include: memberInclude });
    });

    await this.send(ctx, outgoing);
    return created.map((m) => toMemberView(m));
  }

  /** New link (old one stops working) valid for another 7 days. */
  async resend(ctx: ActorContext, id: string): Promise<TeamMemberView> {
    let outgoing: OutgoingInvite | null = null;
    const view = await this.prisma.$transaction(async (tx) => {
      const m = await this.access.mustMember(tx, ctx, id);
      if (m.status !== "INVITED") throw new BadRequestException("This person has already joined the team.");
      const token = randomToken();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + INVITE_EXPIRY_DAYS * DAY_MS);
      await tx.teamMember.update({
        where: { id },
        data: { inviteTokenHash: sha256(token), inviteSentAt: now, inviteExpiresAt: expiresAt, inviteResentCount: { increment: 1 }, invitedById: ctx.userId },
      });
      await this.access.event(tx, ctx, "INVITE_RESENT", m.id, m.email, `New link valid for ${INVITE_EXPIRY_DAYS} days`);
      outgoing = { email: m.email, token, roleName: m.role.name, message: m.inviteMessage ?? "", expiresAt };
      return toMemberView(await this.access.mustMember(tx, ctx, id));
    });
    await this.send(ctx, [outgoing!]);
    return view;
  }

  async revoke(ctx: ActorContext, id: string): Promise<{ id: string; revoked: true }> {
    return this.prisma.$transaction(async (tx) => {
      const m = await this.access.mustMember(tx, ctx, id);
      if (m.status !== "INVITED") throw new BadRequestException("This person has already joined. Remove them from the team instead.");
      await tx.teamMember.delete({ where: { id } });
      await this.access.event(tx, ctx, "INVITE_REVOKED", null, m.email, `${m.role.name} invitation cancelled`);
      return { id, revoked: true as const };
    });
  }

  // ---------------------------------------------------------------- public (invitation link)

  private async byToken(token: string) {
    const m = await this.prisma.teamMember.findUnique({
      where: { inviteTokenHash: sha256(token) },
      include: { role: { select: { name: true } }, invitedBy: { select: { name: true } } },
    });
    if (!m || m.status !== "INVITED") throw new NotFoundException("This invitation link is invalid or has already been used.");
    return m;
  }

  /** What the accept-invite page shows before the person sets a password. */
  async preview(token: string) {
    const m = await this.byToken(token);
    return {
      email: m.email,
      roleName: m.role.name,
      workspaceName: await this.workspaceName(m.institutionId),
      invitedBy: m.invitedBy?.name ?? "A team admin",
      message: m.inviteMessage ?? "",
      expiresAt: m.inviteExpiresAt!.toISOString(),
      expired: m.inviteExpiresAt!.getTime() <= Date.now(),
    };
  }

  /** Creates the staff account (or reactivates a former one) and joins the team. Sign in afterwards. */
  async accept(dto: AcceptInviteDto): Promise<{ joined: true; email: string }> {
    const m = await this.byToken(dto.token);
    if (m.inviteExpiresAt!.getTime() <= Date.now()) throw new GoneException("This invitation has expired. Ask the team admin to send a new one.");
    await this.securityPolicy.assertPassword(m.institutionId ?? null, dto.password);
    const password = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.user.findFirst({ where: { email: { equals: m.email, mode: "insensitive" } } });
      let userId: string;
      if (existing) {
        if (existing.deletedAt || existing.role !== STAFF_ROLE || (existing.institutionId ?? null) !== m.institutionId)
          throw new ConflictException("This email already belongs to another account.");
        await tx.user.update({ where: { id: existing.id }, data: { name: dto.name, password, passwordChangedAt: new Date(), status: "ACTIVE", emailVerified: true } });
        userId = existing.id;
      } else {
        userId = (
          await tx.user.create({
            data: { name: dto.name, email: m.email, password, role: STAFF_ROLE, status: "ACTIVE", emailVerified: true, institutionId: m.institutionId },
          })
        ).id;
      }
      // Guard against double-accept (two tabs): only the first flips INVITED → ACTIVE.
      const res = await tx.teamMember.updateMany({
        where: { id: m.id, status: "INVITED" },
        data: { userId, status: "ACTIVE", joinedAt: new Date(), inviteTokenHash: null, inviteSentAt: null, inviteExpiresAt: null, inviteMessage: null },
      });
      if (res.count === 0) throw new NotFoundException("This invitation link is invalid or has already been used.");
      await tx.teamEvent.create({
        data: { institutionId: m.institutionId, type: "JOINED", actorId: userId, actorName: dto.name, targetId: m.id, targetName: dto.name, detail: `Joined as ${m.role.name}` },
      });
    });
    return { joined: true, email: m.email };
  }
}
