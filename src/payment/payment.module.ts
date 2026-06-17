import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { HttpModule } from "@nestjs/axios";
import { PaymentController } from "./payment.controller";
import { PaymentService } from "./payment.service";
import { EnrollmentModule } from "../enrollment/enrollment.module";
import { InvoiceModule } from "../invoice/invoice.module";

@Module({
  imports: [PrismaModule, HttpModule, EnrollmentModule, InvoiceModule],
  controllers: [PaymentController],
  providers: [PaymentService],
})
export class PaymentModule {}
