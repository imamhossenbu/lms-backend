import { Module } from "@nestjs/common";

import { PrismaModule } from "../prisma/prisma.module";
import { HttpModule } from "@nestjs/axios";
import { PaymentController } from "./payment.controller";
import { PaymentService } from "./payment.service";

@Module({
  imports: [PrismaModule, HttpModule],
  controllers: [PaymentController],
  providers: [PaymentService],
})
export class PaymentModule {}
