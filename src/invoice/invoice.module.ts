import { Module } from "@nestjs/common";
import { InvoiceService } from "./invoice.service";
import { InvoiceController } from "./invoice.controller";
import { PrismaModule } from "../prisma/prisma.module";
import { CloudinaryService } from "../cloudinary/cloudinary.service";

@Module({
  imports: [PrismaModule],
  controllers: [InvoiceController],
  providers: [InvoiceService, CloudinaryService],
  exports: [InvoiceService],
})
export class InvoiceModule {}
