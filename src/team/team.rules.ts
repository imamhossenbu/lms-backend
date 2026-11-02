import { ForbiddenException } from "@nestjs/common";
import { ACTION_LABEL, countPermissions, MODULE_LABEL, subtractPermissions, TEAM_MODULES, type RolePermissions } from "./team-permissions";
import type { ActorContext } from "./services/team-access.service";

/** Privilege-escalation guard: staff can only hand out permissions they hold themselves. */
export function assertCanGrant(ctx: Pick<ActorContext, "permissions">, granting: RolePermissions) {
  const missing = subtractPermissions(granting, ctx.permissions);
  if (countPermissions(missing) === 0) return;
  const first = TEAM_MODULES.find((m) => missing[m].length > 0)!;
  throw new ForbiddenException(`You can only grant permissions you have yourself (missing ${MODULE_LABEL[first]} → ${ACTION_LABEL[missing[first][0]!]}).`);
}

/** Nobody edits their own access — another admin has to. */
export function assertNotSelf(ctx: Pick<ActorContext, "userId">, member: { userId: string | null }) {
  if (member.userId && member.userId === ctx.userId) throw new ForbiddenException("You can't change your own access. Ask another admin with Team permissions.");
}

/** Super Admins (owner / locked role) can only be changed by another Super Admin. */
export function assertCanTouch(ctx: Pick<ActorContext, "isSuperAdmin">, target: { isOwner: boolean; role: { isLocked: boolean } }) {
  if ((target.isOwner || target.role.isLocked) && !ctx.isSuperAdmin) throw new ForbiddenException("Only a Super Admin can change another Super Admin.");
}

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
