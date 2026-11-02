import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import type { RoleDto } from "../dto/team.dto";
import {
  countPermissions,
  diffPermissions,
  isRoleModified,
  modulesWithAccess,
  normalizeExtras,
  normalizePermissions,
  subtractPermissions,
  type RolePermissions,
} from "../team-permissions";
import { assertCanGrant } from "../team.rules";
import type { TeamRoleView } from "../team.types";
import { memberExtras, rolePermissions, TeamAccessService, toRoleView, type ActorContext, type Tx } from "./team-access.service";

const scope = (p: RolePermissions) => `${modulesWithAccess(p).length} modules · ${countPermissions(p)} permissions`;

/**
 * Roles. Custom roles are fully editable. System roles keep their name but their description, colour and
 * permissions can change (and be reset to the shipped preset). Super Admin (locked) can't be edited.
 */
@Injectable()
export class TeamRolesService {
  constructor(private readonly access: TeamAccessService) {}

  private get prisma() {
    return this.access.prisma;
  }

  async get(ctx: ActorContext, id: string): Promise<TeamRoleView> {
    return toRoleView(await this.access.mustRole(this.prisma, ctx, id));
  }

  private async assertUniqueName(tx: Tx, ctx: ActorContext, name: string, exceptId?: string) {
    const clash = await tx.teamRole.findFirst({
      where: { institutionId: ctx.tenantId, name: { equals: name, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: { id: true },
    });
    if (clash) throw new ConflictException(`A role named "${name}" already exists.`);
  }

  /** After a role's permissions change, drop extras its holders now get from the role (extras ∩ role = ∅). */
  private async repruneHolders(tx: Tx, roleId: string, perms: RolePermissions) {
    const holders = await tx.teamMember.findMany({ where: { roleId }, select: { id: true, extraPermissions: true } });
    for (const h of holders) await tx.teamMember.update({ where: { id: h.id }, data: { extraPermissions: normalizeExtras(memberExtras(h), perms) } });
  }

  async create(ctx: ActorContext, dto: RoleDto): Promise<TeamRoleView> {
    const permissions = normalizePermissions(dto.permissions);
    if (countPermissions(permissions) === 0) throw new BadRequestException("Turn on at least one permission");
    assertCanGrant(ctx, permissions);
    return this.prisma.$transaction(async (tx) => {
      await this.assertUniqueName(tx, ctx, dto.name);
      const role = await tx.teamRole.create({
        data: { institutionId: ctx.tenantId, name: dto.name, description: dto.description, tone: dto.tone, permissions, isSystem: false, isLocked: false },
      });
      await this.access.event(tx, ctx, "ROLE_CREATED", role.id, role.name, scope(permissions));
      return toRoleView(role);
    });
  }

  async update(ctx: ActorContext, id: string, dto: RoleDto): Promise<TeamRoleView> {
    const permissions = normalizePermissions(dto.permissions);
    if (countPermissions(permissions) === 0) throw new BadRequestException("Turn on at least one permission");
    return this.prisma.$transaction(async (tx) => {
      const cur = await this.access.mustRole(tx, ctx, id);
      if (cur.isLocked) throw new BadRequestException(`${cur.name} always has every permission and can't be edited.`);
      if (cur.isSystem && dto.name !== cur.name) throw new BadRequestException(`System role names can't be changed. ${cur.name} keeps its name.`);
      const before = rolePermissions(cur);
      assertCanGrant(ctx, subtractPermissions(permissions, before));
      await this.assertUniqueName(tx, ctx, dto.name, id);

      const next = await tx.teamRole.update({
        where: { id },
        data: { name: cur.isSystem ? cur.name : dto.name, description: dto.description, tone: dto.tone, permissions },
      });
      await this.repruneHolders(tx, id, permissions);
      const changes = [cur.name !== next.name ? `Renamed from ${cur.name}` : "", diffPermissions(before, permissions)].filter(Boolean).join(" · ");
      await this.access.event(tx, ctx, "ROLE_UPDATED", id, next.name, changes || "Details updated");
      return toRoleView(next);
    });
  }

  /** System roles: restores the shipped preset permissions. */
  async resetToDefault(ctx: ActorContext, id: string): Promise<TeamRoleView> {
    return this.prisma.$transaction(async (tx) => {
      const cur = await this.access.mustRole(tx, ctx, id);
      if (cur.isLocked) throw new BadRequestException(`${cur.name} always has every permission.`);
      if (!cur.isSystem || !cur.defaultPermissions) throw new BadRequestException("Only built-in roles have default permissions.");
      const view = toRoleView(cur);
      if (!isRoleModified(view)) throw new BadRequestException(`${cur.name} already uses its default permissions.`);
      const preset = view.defaultPermissions!;
      assertCanGrant(ctx, subtractPermissions(preset, view.permissions));

      const next = await tx.teamRole.update({ where: { id }, data: { permissions: preset } });
      await this.repruneHolders(tx, id, preset);
      await this.access.event(tx, ctx, "ROLE_RESET", id, next.name, diffPermissions(view.permissions, preset) || "Default permissions restored");
      return toRoleView(next);
    });
  }

  async duplicate(ctx: ActorContext, id: string): Promise<TeamRoleView> {
    return this.prisma.$transaction(async (tx) => {
      const src = await this.access.mustRole(tx, ctx, id);
      const permissions = rolePermissions(src);
      assertCanGrant(ctx, permissions);
      const taken = new Set(
        (await tx.teamRole.findMany({ where: { institutionId: ctx.tenantId }, select: { name: true } })).map((r) => r.name.toLowerCase()),
      );
      let name = `${src.name} (Copy)`.slice(0, 40);
      for (let i = 2; taken.has(name.toLowerCase()); i++) name = `${src.name} (Copy ${i})`.slice(0, 40);
      const copy = await tx.teamRole.create({
        data: { institutionId: ctx.tenantId, name, description: src.description, tone: src.tone, permissions, isSystem: false, isLocked: false },
      });
      await this.access.event(tx, ctx, "ROLE_CREATED", copy.id, copy.name, `Duplicated from ${src.name}`);
      return toRoleView(copy);
    });
  }

  async remove(ctx: ActorContext, id: string): Promise<{ id: string; deleted: true }> {
    return this.prisma.$transaction(async (tx) => {
      const role = await this.access.mustRole(tx, ctx, id);
      if (role.isSystem) throw new BadRequestException("System roles can't be deleted.");
      const assigned = await tx.teamMember.count({ where: { roleId: id } });
      if (assigned > 0) throw new BadRequestException(`${assigned} ${assigned === 1 ? "person still has" : "people still have"} this role. Move them to another role first.`);
      await tx.teamRole.delete({ where: { id } });
      await this.access.event(tx, ctx, "ROLE_DELETED", null, role.name, "Custom role removed");
      return { id, deleted: true as const };
    });
  }
}

