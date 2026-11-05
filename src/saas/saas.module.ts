import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { MailService } from "../auth/mail/mail.service";
import { MarketingLeadsService } from "./leads/marketing-leads.service";
import { PlatformStatsService } from "./leads/platform-stats.service";
import { TestimonialsService } from "./testimonials/testimonials.service";
import { OwnerTestimonialsController } from "./testimonials/owner-testimonials.controller";
import { BlogService } from "./blog/blog.service";
import { OwnerBlogController } from "./blog/owner-blog.controller";
import { PublicBlogController } from "./blog/public-blog.controller";
import { CloudinaryService } from "../cloudinary/cloudinary.service";
import { PrismaModule } from "../prisma/prisma.module";
import { OwnerAlertsController } from "./alerts/owner-alerts.controller";
import { AlertsService } from "./alerts/alerts.service";
import { OwnerConsoleSettingsController } from "./console-settings/owner-console-settings.controller";
import { ConsoleSettingsReader } from "./console-settings/services/console-settings-reader.service";
import { ConsoleSettingsService } from "./console-settings/services/console-settings.service";
import { OwnerCouponsController } from "./coupons/owner-coupons.controller";
import { CouponRedemptionsService } from "./coupons/services/coupon-redemptions.service";
import { CouponsService } from "./coupons/services/coupons.service";
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
 * Owner Console extras live here too because they hook into the billing transactions:
 *   coupons/          platform coupons (CRUD + redemption; discounts priced into SaasCoreService.addInvoice)
 *   alerts/           live "needs attention" items + the owner's read-state
 *   console-settings/ platform settings row (invoice prefix, fallback tax rate, default trial days feed billing)
 * SaasLifecycleService runs hourly: trial expiry, renewals and scheduled cancellations.
 */
@Module({
  imports: [
    PrismaModule,
    JwtModule.register({ secret: process.env.SUPER_SECRET_KEY, signOptions: { expiresIn: "1d" } }),
  ],
  controllers: [
    OwnerTestimonialsController,
    OwnerBlogController,
    PublicBlogController,
    SaasPublicController,
    OwnerPlansController,
    OwnerInstitutionsController,
    OwnerBillingController,
    InstitutionBillingController,
    OwnerCouponsController,
    OwnerAlertsController,
    OwnerConsoleSettingsController,
  ],
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
    MarketingLeadsService,
    PlatformStatsService,
    TestimonialsService,
    BlogService,
    ConsoleSettingsReader,
    ConsoleSettingsService,
    CouponsService,
    CouponRedemptionsService,
    AlertsService,
    CloudinaryService,
  ],
  exports: [SaasCoreService, SaasPlansService, SaasInstitutionsService],
})
export class SaasModule {}
