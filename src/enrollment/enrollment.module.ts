import { Module } from "@nestjs/common";
import { EnrollmentService } from "./enrollment.service";
import { EnrollmentController } from "./enrollment.controller";
import { PrismaModule } from "../prisma/prisma.module";
import { CertificateModule } from "../certificate/certificate.module";

@Module({
  imports: [PrismaModule, CertificateModule],
  controllers: [EnrollmentController],
  providers: [EnrollmentService],
  exports: [EnrollmentService],
})
export class EnrollmentModule {}
