import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { OrderLifecycleService } from "./order-lifecycle.service";
import { SslCommerzService } from "./sslcommerz.service";

/**
 * Shared commerce building blocks: the order lifecycle (paid / failed / cancelled / reopened / refunded)
 * and the SSLCommerz server-to-server client. Used by checkout callbacks (PaymentModule) and the admin
 * Orders / Payments API (OrdersModule).
 */
@Module({
  imports: [PrismaModule],
  providers: [OrderLifecycleService, SslCommerzService],
  exports: [OrderLifecycleService, SslCommerzService],
})
export class CommerceModule {}
