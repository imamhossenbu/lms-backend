import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { MailService } from "../auth/mail/mail.service";
import { PrismaModule } from "../prisma/prisma.module";
import { InstitutionBillingController } from "./controllers/institution-billing.controller";
import { OwnerBillingController } from "./controllers/owner-billing.controller";
import { OwnerInstitutionsController } from "./controllers/owner-institutions.controller";
import { OwnerPlansController } from "./controllers/owner-plans.controller";
import { SaasPublicController } from "./controllers/saas-public.controller";
import { SaasCoreService } from "./services/saas-core.service";
import { SaasDomainsService } from "./services/saas-domains.service";
import { SaasInstitutionsService } from "./services/saas-institutions.service";
import { SaasInvoicesService } from "./services/saas-invoices.service";
import { SaasLifecycleService } from "./services/saas-lifecycle.service";
import { SaasPaymentGateway } from "./services/saas-payment.gateway";
import { SaasPlansService } from "./services/saas-plans.service";
import { SaasSubscriptionService } from "./services/saas-subscription.service";

/**
 * SaaS layer: plans, institutions (tenants) + subscriptions, invoices, timeline events, custom domains.
 *   /saas/public/*  pricing + self-signup (no auth)
 *   /saas/owner/*   Owner Console (role SUPER_ADMIN)
 *   /saas/me/*      institution admin billing (role ADMIN, scoped to the caller's institution)
 * SaasLifecycleService runs hourly: trial expiry, renewals and scheduled cancellations.
 */
@Module({
  imports: [
    PrismaModule,
    JwtModule.register({ secret: process.env.SUPER_SECRET_KEY, signOptions: { expiresIn: "1d" } }),
  ],
  controllers: [SaasPublicController, OwnerPlansController, OwnerInstitutionsController, OwnerBillingController, InstitutionBillingController],
  providers: [
    SaasCoreService,
    SaasPaymentGateway,
    SaasPlansService,
    SaasInstitutionsService,
    SaasSubscriptionService,
    SaasInvoicesService,
    SaasDomainsService,
    SaasLifecycleService,
    MailService,
  ],
  exports: [SaasCoreService, SaasPlansService, SaasInstitutionsService],
})
export class SaasModule {}
