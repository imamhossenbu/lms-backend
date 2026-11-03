import { Module } from "@nestjs/common";
import { CertificatesModule } from "../certificates/certificates.module";
import { PrismaModule } from "../prisma/prisma.module";
import { CertificateController } from "./certificate.controller";
import { CertificateService } from "./certificate.service";

/** Learner + public certificate routes (/certificate). Shares issuing and the activity log with CertificatesModule. */
@Module({
  imports: [PrismaModule, CertificatesModule],
  controllers: [CertificateController],
  providers: [CertificateService],
  exports: [CertificateService],
})
export class CertificateModule {}
