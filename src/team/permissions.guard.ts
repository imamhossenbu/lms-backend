import { applyDecorators, CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata, UseGuards } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ACTION_LABEL, MODULE_LABEL, type PermissionAction, type TeamModule } from "./team-permissions";
import { TeamAccessService } from "./services/team-access.service";

const PERMISSION_KEY = "team:permission";

interface RequiredPermission {
  module: TeamModule;
  action: PermissionAction;
}

/**
 * Checks the signed-in staff member's effective permissions (role ∪ extras) for one module action.
 * Runs after AuthGuard("jwt") + RolesGuard (class-level guards run first). The resolved access is cached
 * on the request so several checks cost one lookup.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: TeamAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<RequiredPermission>(PERMISSION_KEY, [context.getHandler(), context.getClass()]);
    if (!required) return true;
    const req = context.switchToHttp().getRequest();
    req.teamAccess ??= await this.access.actor(req.user);
    if (!this.access.can(req.teamAccess, required.module, required.action))
      throw new ForbiddenException(`You need the "${MODULE_LABEL[required.module]} → ${ACTION_LABEL[required.action]}" permission to do this.`);
    return true;
  }
}

/** `@RequirePermission("students", "manage")` — staff permission check for one endpoint. */
export const RequirePermission = (module: TeamModule, action: PermissionAction) =>
  applyDecorators(SetMetadata(PERMISSION_KEY, { module, action }), UseGuards(PermissionsGuard));
