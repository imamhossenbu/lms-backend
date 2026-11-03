import { Module } from "@nestjs/common";
import { MailService } from "../auth/mail/mail.service";
import { NotificationService } from "../notification/notification.service";
import { PrismaModule } from "../prisma/prisma.module";
import { AdminCertificateTemplatesController } from "./admin-certificate-templates.controller";
import { AdminCertificatesController } from "./admin-certificates.controller";
import { CertificateAdminService } from "./services/certificate-admin.service";
import { CertificateEligibilityService } from "./services/certificate-eligibility.service";
import { CertificateEventsService } from "./services/certificate-events.service";
import { CertificateIssuerService } from "./services/certificate-issuer.service";
import { CertificateTemplateAdminService } from "./services/certificate-template-admin.service";
import { CertificatesQueryService } from "./services/certificates-query.service";

/**
 * Admin panel › Certificates (/admin/certificates). Learners and the public verify page use the legacy
 * CertificateModule (/certificate), and enrollment progress auto-issues through CertificateIssuerService.
 */
@Module({
  imports: [PrismaModule],
  // Templates first: its literal "templates" path must be matched before AdminCertificatesController's ":id".
  controllers: [AdminCertificateTemplatesController, AdminCertificatesController],
  providers: [
    CertificatesQueryService,
    CertificateTemplateAdminService,
    CertificateAdminService,
    CertificateIssuerService,
    CertificateEligibilityService,
    CertificateEventsService,
    MailService,
    NotificationService,
  ],
  exports: [CertificateIssuerService, CertificateEventsService, CertificatesQueryService],
})
export class CertificatesModule {}
