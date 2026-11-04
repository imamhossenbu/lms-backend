import { applyDecorators, CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata, UseGuards } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ACTION_LABEL, MODULE_LABEL, type PermissionAction, type TeamModule } from "./team-permissions";
import { TeamAccessService } from "./services/team-access.service";
import { TWO_FACTOR_SETUP_MESSAGE } from "../workspace-settings/workspace-settings.constants";

const PERMISSION_KEY = "team:permission";
const ALLOW_PENDING_2FA_KEY = "team:allow-pending-2fa";

interface RequiredPermission {
  module: TeamModule;
  action: PermissionAction;
  /** Only enforce for ADMIN staff; other roles (TEACHER, STUDENT) rely on the endpoint's own role / ownership checks. */
  staffOnly?: boolean;
}

/**
 * Checks the signed-in staff member's effective permissions (role ∪ extras) for one module action.
 * Runs after AuthGuard("jwt") + RolesGuard (class-level guards run first). The resolved access is cached
 * on the request so several checks cost one lookup.
 *
 * Also enforces Settings › Security › "Require two-factor for admins": staff without 2FA get 403
 * (`code: "TWO_FACTOR_SETUP_REQUIRED"`) everywhere except @AllowPendingTwoFactor() endpoints. Endpoints
 * without @RequirePermission (/auth/2fa/*, /team/me, profile basics) are never blocked by this guard.
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
    if (required.staffOnly && req.user?.role !== "ADMIN") return true;
    req.teamAccess ??= await this.access.actor(req.user);
    if (req.teamAccess.twoFactorSetupRequired && !this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING_2FA_KEY, [context.getHandler(), context.getClass()]))
      throw new ForbiddenException({ statusCode: 403, error: "Forbidden", code: "TWO_FACTOR_SETUP_REQUIRED", message: TWO_FACTOR_SETUP_MESSAGE });
    if (!this.access.can(req.teamAccess, required.module, required.action))
      throw new ForbiddenException(`You need the "${MODULE_LABEL[required.module]} → ${ACTION_LABEL[required.action]}" permission to do this.`);
    return true;
  }
}

/** `@RequirePermission("students", "manage")` — staff permission check for one endpoint. */
export const RequirePermission = (module: TeamModule, action: PermissionAction) =>
  applyDecorators(SetMetadata(PERMISSION_KEY, { module, action }), UseGuards(PermissionsGuard));

/**
 * For endpoints shared by staff and other roles (e.g. courses: admins AND instructors): ADMIN callers need the
 * team permission; TEACHER / STUDENT callers skip this check and are governed by @Roles + ownership checks.
 * Put it ABOVE the method's @UseGuards(AuthGuard("jwt"), RolesGuard) so authentication runs first.
 */
export const StaffPermission = (module: TeamModule, action: PermissionAction) =>
  applyDecorators(SetMetadata(PERMISSION_KEY, { module, action, staffOnly: true }), UseGuards(PermissionsGuard));

/** Lets staff who still have to set up required 2FA use this endpoint (e.g. reading Settings). */
export const AllowPendingTwoFactor = () => SetMetadata(ALLOW_PENDING_2FA_KEY, true);
