import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, TeamEventType, TeamMember, TeamRole } from "../../../generated/prisma";
import type { AuthUser } from "../../common/auth-user";
import { PrismaService } from "../../prisma/prisma.service";
import {
  effectivePermissions,
  emptyPermissions,
  normalizePermissions,
  SUPER_ADMIN_KEY,
  SYSTEM_ROLES,
  type PermissionAction,
  type RolePermissions,
  type TeamModule,
} from "../team-permissions";
import type { MyTeamAccess, TeamEventView, TeamMemberView, TeamRoleView } from "../team.types";

export type Tx = Prisma.TransactionClient;
export const STAFF_ROLE = "ADMIN";

export const memberInclude = {
  user: { select: { name: true, avatar: true, twoFactorEnabled: true, lastLoginAt: true, lastLoginIp: true } },
  invitedBy: { select: { name: true } },
} as const;
export type MemberRow = TeamMember & {
  user: { name: string; avatar: string | null; twoFactorEnabled: boolean; lastLoginAt: Date | null; lastLoginIp: string | null } | null;
  invitedBy: { name: string } | null;
};

/** Everything a mutation needs to know about the signed-in staff member. */
export interface ActorContext {
  tenantId: string | null;
  userId: string;
  name: string;
  member: TeamMember;
  role: TeamRole;
  permissions: RolePermissions;
  /** Owner or Super Admin (locked role). */
  isSuperAdmin: boolean;
}

export const rolePermissions = (r: Pick<TeamRole, "permissions">) => normalizePermissions(r.permissions as Partial<RolePermissions>);
export const memberExtras = (m: Pick<TeamMember, "extraPermissions">) => normalizePermissions(m.extraPermissions as Partial<RolePermissions>);

export function toRoleView(r: TeamRole): TeamRoleView {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    tone: r.tone,
    isSystem: r.isSystem,
    isLocked: r.isLocked,
    permissions: rolePermissions(r),
    defaultPermissions: r.defaultPermissions ? normalizePermissions(r.defaultPermissions as Partial<RolePermissions>) : null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export function toMemberView(m: MemberRow, now = Date.now()): TeamMemberView {
  const invited = m.status === "INVITED";
  return {
    id: m.id,
    name: m.user?.name ?? "",
    email: m.email,
    avatarUrl: m.user?.avatar ?? null,
    roleId: m.roleId,
    // Extras are stored relative to the role; the role may only grant more, never less.
    extraPermissions: m.isOwner ? emptyPermissions() : memberExtras(m),
    status: m.status,
    isOwner: m.isOwner,
    twoFactorEnabled: m.user?.twoFactorEnabled ?? false,
    lastActiveAt: m.user?.lastLoginAt?.toISOString() ?? null,
    lastLoginIp: m.user?.lastLoginIp ?? "",
    location: "",
    joinedAt: m.joinedAt?.toISOString() ?? null,
    invite:
      invited && m.inviteSentAt && m.inviteExpiresAt
        ? {
            status: m.inviteExpiresAt.getTime() <= now ? "EXPIRED" : "PENDING",
            sentAt: m.inviteSentAt.toISOString(),
            expiresAt: m.inviteExpiresAt.toISOString(),
            message: m.inviteMessage ?? "",
            invitedBy: m.invitedBy?.name ?? "A team admin",
            resentCount: m.inviteResentCount,
          }
        : null,
  };
}

export const toEventView = (e: { id: string; type: string; actorName: string; targetId: string | null; targetName: string; detail: string; at: Date }): TeamEventView => ({
  id: e.id,
  type: e.type,
  actor: e.actorName,
  targetId: e.targetId,
  targetName: e.targetName,
  detail: e.detail,
  at: e.at.toISOString(),
});

/**
 * Workspace bootstrap + permission resolution for admin-panel staff.
 * A workspace = one tenant (institutionId; null for the legacy single-tenant data).
 */
@Injectable()
export class TeamAccessService {
  constructor(readonly prisma: PrismaService) {}

  /**
   * First use per workspace: seeds the built-in roles and enrolls the existing admins
   * (oldest = owner / Super Admin, others = Admin). Serialized with an advisory lock.
   */
  async ensureWorkspace(tenantId: string | null): Promise<void> {
    const ready = await this.prisma.teamRole.count({ where: { institutionId: tenantId, systemKey: SUPER_ADMIN_KEY } });
    if (ready) return;
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`team-bootstrap:${tenantId ?? "legacy"}`}))`;
      if (await tx.teamRole.count({ where: { institutionId: tenantId, systemKey: SUPER_ADMIN_KEY } })) return;

      const roles = new Map<string, TeamRole>();
      for (const def of SYSTEM_ROLES) {
        const permissions = def.permissions();
        roles.set(
          def.key,
          await tx.teamRole.create({
            data: { institutionId: tenantId, systemKey: def.key, name: def.name, description: def.description, tone: def.tone, isSystem: true, isLocked: def.locked, permissions, defaultPermissions: permissions },
          }),
        );
      }
      const admins = await tx.user.findMany({
        where: { institutionId: tenantId, role: STAFF_ROLE, deletedAt: null, status: "ACTIVE", teamMembership: null },
        orderBy: { createdAt: "asc" },
      });
      for (const [i, admin] of admins.entries()) {
        await tx.teamMember.create({
          data: {
            institutionId: tenantId,
            userId: admin.id,
            email: admin.email.toLowerCase(),
            roleId: roles.get(i === 0 ? SUPER_ADMIN_KEY : "admin")!.id,
            extraPermissions: emptyPermissions(),
            status: "ACTIVE",
            isOwner: i === 0,
            joinedAt: admin.createdAt,
          },
        });
      }
    });
  }

  /** Resolves the signed-in staff member. Throws 403 when they aren't an active team member. */
  async actor(user: AuthUser): Promise<ActorContext> {
    if (user.role !== STAFF_ROLE) throw new ForbiddenException("Only admin-panel staff can do this.");
    const tenantId = user.institutionId ?? null;
    await this.ensureWorkspace(tenantId);
    const member = await this.prisma.teamMember.findUnique({ where: { userId: user.userId }, include: { role: true, user: { select: { name: true } } } });
    if (!member || member.institutionId !== tenantId) throw new ForbiddenException("You're not a member of this workspace's team.");
    if (member.status !== "ACTIVE") throw new ForbiddenException("Your team access is suspended.");
    const permissions = effectivePermissions({ isOwner: member.isOwner, extraPermissions: memberExtras(member) }, { permissions: rolePermissions(member.role), isLocked: member.role.isLocked });
    return {
      tenantId,
      userId: user.userId,
      name: member.user?.name ?? user.email,
      member,
      role: member.role,
      permissions,
      isSuperAdmin: member.isOwner || member.role.isLocked,
    };
  }

  can(ctx: Pick<ActorContext, "permissions">, module: TeamModule, action: PermissionAction) {
    return ctx.permissions[module].includes(action);
  }

  async myAccess(user: AuthUser): Promise<MyTeamAccess> {
    const ctx = await this.actor(user);
    return { memberId: ctx.member.id, roleId: ctx.role.id, roleName: ctx.role.name, isOwner: ctx.member.isOwner, permissions: ctx.permissions };
  }

  // ---------------------------------------------------------------- lookups within the actor's workspace

  async mustMember(tx: Tx, ctx: ActorContext, id: string): Promise<MemberRow & { role: TeamRole }> {
    const m = await tx.teamMember.findFirst({ where: { id, institutionId: ctx.tenantId }, include: { ...memberInclude, role: true } });
    if (!m) throw new NotFoundException("This team member no longer exists.");
    return m;
  }

  async mustRole(tx: Tx, ctx: ActorContext, id: string): Promise<TeamRole> {
    const r = await tx.teamRole.findFirst({ where: { id, institutionId: ctx.tenantId } });
    if (!r) throw new NotFoundException("This role no longer exists.");
    return r;
  }

  event(tx: Tx, ctx: ActorContext, type: TeamEventType, targetId: string | null, targetName: string, detail: string) {
    return tx.teamEvent.create({ data: { institutionId: ctx.tenantId, type, actorId: ctx.userId, actorName: ctx.name, targetId, targetName, detail } });
  }
}
