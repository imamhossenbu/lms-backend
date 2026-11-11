import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { MailService } from "../auth/mail/mail.service";
import { CommerceModule } from "../commerce/commerce.module";
import { InvoiceModule } from "../invoice/invoice.module";
import { PrismaModule } from "../prisma/prisma.module";
import { WorkspaceSettingsModule } from "../workspace-settings/workspace-settings.module";
import { AcademySiteService } from "./academy-site.service";
import { AdminWebsiteController } from "./admin/admin-website.controller";
import { AdminWebsiteService } from "./admin/admin-website.service";
import { PublicAcademyController } from "./public-academy.controller";
import { AcademyCheckoutCallbackController } from "./learner/academy-checkout-callback.controller";
import { AcademyCheckoutService } from "./learner/academy-checkout.service";
import { LearnerAuthController, LearnerMeController } from "./learner/learner.controller";
import { LearnerAuthService } from "./learner/learner-auth.service";

/**
 * Public data for each academy's own website (lms-academy-site, port 3003):
 *   GET /academy/public/resolve?host=      host → slug (subdomain of SAAS_ROOT_DOMAIN or verified custom domain)
 *   GET /academy/public/:slug              profile + branding + stats + categories
 *   GET /academy/public/:slug/courses      published catalogue      GET …/courses/:courseSlug  course page
 *   GET /academy/public/:slug/levels       filter options           GET …/instructors, …/reviews
 * Learners (learner/):
 *   POST /academy/public/:slug/auth/register|verify|resend|login   learner accounts (STUDENT of that academy)
 *   /academy/:slug/me (JWT)   GET me, courses/:courseSlug/access, checkout/:courseSlug (quote), POST checkout, orders/:id
 *   POST /academy/checkout/sslcommerz/success|fail|cancel|ipn   gateway callbacks → 303 to the academy site
 * Admin panel › Website (admin/): /admin/website GET|PATCH content, /admin/website/subscribers (+ export, :id PATCH|DELETE)
 */
@Module({
  imports: [PrismaModule, WorkspaceSettingsModule, AuthModule, CommerceModule, InvoiceModule],
  controllers: [PublicAcademyController, LearnerAuthController, LearnerMeController, AcademyCheckoutCallbackController, AdminWebsiteController],
  providers: [AcademySiteService, LearnerAuthService, AcademyCheckoutService, MailService, AdminWebsiteService],
})
export class AcademySiteModule {}
