import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MailService } from "../../auth/mail/mail.service";
import type { UpdateMemberDto } from "../dto/team.dto";
import { countPermissions, listGrants, normalizeExtras, samePermissions, subtractPermissions, type RolePermissions } from "../team-permissions";
import { assertCanGrant, assertCanTouch, assertNotSelf, plural } from "../team.rules";
import type { TeamMemberView, TeamSnapshot } from "../team.types";
import { memberExtras, memberInclude, rolePermissions, TeamAccessService, toEventView, toMemberView, toRoleView, type ActorContext } from "./team-access.service";

const EVENTS_IN_SNAPSHOT = 300;

/** Team members: snapshot, role / status changes, removal, extra permissions, 2FA reset + reminders. */
@Injectable()
export class TeamMembersService {
  private readonly logger = new Logger(TeamMembersService.name);

  constructor(
    private readonly access: TeamAccessService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  private get prisma() {
    return this.access.prisma;
  }

  /** Whole workspace in the panel's `TeamSeed` shape (members, roles, latest events). */
  async snapshot(ctx: ActorContext): Promise<TeamSnapshot> {
    const where = { institutionId: ctx.tenantId };
    const [members, roles, events] = await Promise.all([
      this.prisma.teamMember.findMany({ where, include: memberInclude, orderBy: [{ isOwner: "desc" }, { createdAt: "asc" }] }),
      this.prisma.teamRole.findMany({ where, orderBy: [{ isSystem: "desc" }, { createdAt: "asc" }] }),
      this.prisma.teamEvent.findMany({ where, orderBy: { at: "desc" }, take: EVENTS_IN_SNAPSHOT }),
    ]);
    const now = Date.now();
    return { members: members.map((m) => toMemberView(m, now)), roles: roles.map(toRoleView), events: events.map(toEventView) };
  }

  async get(ctx: ActorContext, id: string): Promise<TeamMemberView> {
    return toMemberView(await this.access.mustMember(this.prisma, ctx, id));
  }

  async update(ctx: ActorContext, id: string, dto: UpdateMemberDto): Promise<TeamMemberView> {
    return this.prisma.$transaction(async (tx) => {
      const m = await this.access.mustMember(tx, ctx, id);
      const name = m.user?.name || m.email;
      assertNotSelf(ctx, m);
      assertCanTouch(ctx, m);

      if (dto.roleId && dto.roleId !== m.roleId) {
        if (m.isOwner) throw new BadRequestException("The workspace owner always stays Super Admin.");
        const to = await this.access.mustRole(tx, ctx, dto.roleId);
        if (to.isLocked && !ctx.isSuperAdmin) throw new BadRequestException("Only a Super Admin can make someone a Super Admin.");
        if (to.isLocked && m.status === "INVITED") throw new BadRequestException("Super Admin can't be assigned to a pending invitation.");
        const toPerms = rolePermissions(to);
        assertCanGrant(ctx, toPerms);
        const before = memberExtras(m);
        const kept = to.isLocked ? normalizeExtras({}, toPerms) : normalizeExtras(before, toPerms);
        const dropped = countPermissions(subtractPermissions(before, kept));
        await tx.teamMember.update({ where: { id }, data: { roleId: to.id, extraPermissions: kept } });
        await this.access.event(tx, ctx, "ROLE_CHANGED", m.id, name, `${m.role.name} → ${to.name}${dropped ? ` · ${plural(dropped, "extra permission")} now included in the role` : ""}`);
      }

      if (dto.status && dto.status !== m.status) {
        if (m.isOwner) throw new BadRequestException("The workspace owner can't be suspended.");
        if (m.status === "INVITED") throw new BadRequestException("Pending invitations can't be suspended — revoke the invite instead.");
        await tx.teamMember.update({ where: { id }, data: { status: dto.status } });
        const detail = dto.reason || (dto.status === "SUSPENDED" ? "Access paused" : "Access restored");
        await this.access.event(tx, ctx, dto.status === "SUSPENDED" ? "SUSPENDED" : "REACTIVATED", m.id, name, detail);
      }
      return toMemberView(await this.access.mustMember(tx, ctx, id));
    });
  }

  /** Removes a member (their account is deactivated) or cancels an invitation. */
  async remove(ctx: ActorContext, id: string): Promise<{ id: string; removed: true }> {
    return this.prisma.$transaction(async (tx) => {
      const m = await this.access.mustMember(tx, ctx, id);
      if (m.isOwner) throw new BadRequestException("The workspace owner can't be removed.");
      assertNotSelf(ctx, m);
      assertCanTouch(ctx, m);
      await tx.teamMember.delete({ where: { id } });
      if (m.userId) await tx.user.update({ where: { id: m.userId }, data: { status: "INACTIVE" } });
      const invited = m.status === "INVITED";
      await this.access.event(tx, ctx, invited ? "INVITE_REVOKED" : "REMOVED", null, m.user?.name || m.email, invited ? `${m.role.name} invitation cancelled` : `Was ${m.role.name}`);
      return { id, removed: true as const };
    });
  }

  /** Replaces a member's extra permissions (pruned against their role); logs granted / removed. */
  async setExtraPermissions(ctx: ActorContext, id: string, extras: RolePermissions): Promise<TeamMemberView> {
    return this.prisma.$transaction(async (tx) => {
      const m = await this.access.mustMember(tx, ctx, id);
      if (m.isOwner) throw new BadRequestException("The workspace owner already has every permission.");
      if (m.role.isLocked) throw new BadRequestException(`${m.role.name} already has every permission.`);
      assertNotSelf(ctx, m);
      const current = memberExtras(m);
      const next = normalizeExtras(extras, rolePermissions(m.role));
      if (samePermissions(next, current)) return toMemberView(m);

      const added = subtractPermissions(next, current);
      const removed = subtractPermissions(current, next);
      assertCanGrant(ctx, added);
      await tx.teamMember.update({ where: { id }, data: { extraPermissions: next } });
      const name = m.user?.name || m.email;
      if (countPermissions(removed))
        await this.access.event(tx, ctx, "EXTRA_PERMISSIONS_REMOVED", m.id, name, countPermissions(next) === 0 ? `All extras removed (${listGrants(removed)})` : listGrants(removed));
      if (countPermissions(added)) await this.access.event(tx, ctx, "EXTRA_PERMISSIONS_GRANTED", m.id, name, listGrants(added));
      return toMemberView(await this.access.mustMember(tx, ctx, id));
    });
  }

  /** Turns 2FA off for a member (lost phone) — they must enrol again. */
  async resetTwoFactor(ctx: ActorContext, id: string): Promise<TeamMemberView> {
    return this.prisma.$transaction(async (tx) => {
      const m = await this.access.mustMember(tx, ctx, id);
      if (m.status === "INVITED" || !m.userId) throw new BadRequestException("This person hasn't joined yet.");
      assertCanTouch(ctx, m);
      if (!m.user?.twoFactorEnabled) throw new BadRequestException(`${m.user?.name || m.email} doesn't have two-factor authentication set up.`);
      await tx.user.update({ where: { id: m.userId }, data: { twoFactorEnabled: false, twoFactorSecret: null, twoFactorEnabledAt: null } });
      await this.access.event(tx, ctx, "TWO_FA_RESET", m.id, m.user.name, "Must set up 2FA again at next sign-in");
      return toMemberView(await this.access.mustMember(tx, ctx, id));
    });
  }

  /** Emails active members (of the given ids) who still have no 2FA. */
  async remindTwoFactor(ctx: ActorContext, memberIds: string[]): Promise<{ reminded: number }> {
    const members = await this.prisma.teamMember.findMany({
      where: { id: { in: memberIds }, institutionId: ctx.tenantId, status: "ACTIVE", user: { twoFactorEnabled: false } },
      include: { user: { select: { name: true, email: true } } },
    });
    const link = `${this.config.get<string>("FRONTEND_URL") || "http://localhost:3000"}/settings?section=security`;
    let reminded = 0;
    for (const m of members) {
      try {
        await this.mail.sendTwoFactorReminderEmail(m.user!.email, m.user!.name, ctx.name, link);
        reminded++;
      } catch (err: any) {
        this.logger.warn(`2FA reminder to ${m.email} failed: ${err?.message ?? err}`);
      }
    }
    return { reminded };
  }
}
