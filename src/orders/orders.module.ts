import { Module } from "@nestjs/common";
import { MailService } from "../auth/mail/mail.service";
import { CommerceModule } from "../commerce/commerce.module";
import { InvoiceModule } from "../invoice/invoice.module";
import { PrismaModule } from "../prisma/prisma.module";
import { AdminOrdersController } from "./admin-orders.controller";
import { AdminPaymentsController } from "./admin-payments.controller";
import { OrderAdminService } from "./services/order-admin.service";
import { OrdersQueryService } from "./services/orders-query.service";

/**
 * Admin panel › Orders (/admin/orders) and Payments (/admin/payments) — two views of the same orders.
 * Student checkout stays in the legacy OrderModule (/orders) + PaymentModule (/payments).
 */
@Module({
  imports: [PrismaModule, CommerceModule, InvoiceModule],
  controllers: [AdminOrdersController, AdminPaymentsController],
  providers: [OrdersQueryService, OrderAdminService, MailService],
})
export class OrdersModule {}
