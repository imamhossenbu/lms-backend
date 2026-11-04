import { Global, Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { PlanAccessService } from "./plan-access.service";
import { RequireFeatureGuard } from "./require-feature.guard";

/**
 * Plan limits and feature gates, enforced server-side (global so every module can inject it and use
 * @RequireFeature). Usage counters are refreshed on every limit check and every 30 minutes.
 */
@Global()
@Module({
  imports: [PrismaModule],
  providers: [PlanAccessService, RequireFeatureGuard],
  exports: [PlanAccessService, RequireFeatureGuard],
})
export class PlanAccessModule {}
