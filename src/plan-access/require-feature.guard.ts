import { applyDecorators, CanActivate, ExecutionContext, Injectable, SetMetadata, UseGuards } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { tenantOf } from "../common/tenancy";
import type { FeatureKey } from "../saas/saas.constants";
import { PlanAccessService } from "./plan-access.service";

const FEATURE_KEY = "plan:feature";

/** Blocks the endpoint unless the caller's plan includes the feature (runs after authentication). */
@Injectable()
export class RequireFeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly plans: PlanAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const feature = this.reflector.getAllAndOverride<FeatureKey>(FEATURE_KEY, [context.getHandler(), context.getClass()]);
    if (!feature) return true;
    const req = context.switchToHttp().getRequest();
    // SUPER_ADMIN (platform owner) works across workspaces and is never plan-gated.
    if (req.user?.role === "SUPER_ADMIN") return true;
    await this.plans.assertFeature(tenantOf(req.user), feature);
    return true;
  }
}

/** `@RequireFeature("liveClasses")` — 403 PLAN_FEATURE_REQUIRED when the workspace's plan lacks it. */
export const RequireFeature = (feature: FeatureKey) => applyDecorators(SetMetadata(FEATURE_KEY, feature), UseGuards(RequireFeatureGuard));
