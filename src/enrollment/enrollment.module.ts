import { Module } from "@nestjs/common";
import { EnrollmentService } from "./enrollment.service";
import { PrismaModule } from "../prisma/prisma.module";
import { CertificateModule } from "../certificate/certificate.module";

@Module({
    imports: [PrismaModule,CertificateModule],
  providers: [EnrollmentService],
  exports: [EnrollmentService],
})
export class EnrollmentModule {}
