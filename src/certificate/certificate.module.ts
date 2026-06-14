import { Module } from "@nestjs/common";

import { PrismaModule } from "../prisma/prisma.module";
import { CertificateController } from "./certificate.controller";
import { CertificateService } from "./certificate.service";
import { CloudinaryService } from "../cloudinary/cloudinary.service";
import { MailService } from "../auth/mail/mail.service";
import { NotificationModule } from "../notification/notification.module";
import { NotificationService } from "../notification/notification.service";

@Module({
  imports: [PrismaModule],
  controllers: [CertificateController],
  providers: [CertificateService, CloudinaryService, MailService,NotificationService],
  exports: [CertificateService],
})
export class CertificateModule {}
