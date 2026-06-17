import { Controller, Get, Param, UseGuards, Req } from "@nestjs/common";
import { InvoiceService } from "./invoice.service";
import { AuthGuard } from "@nestjs/passport";
import { RequestWithUser } from "../auth/interfaces/request.interface";
import { PrismaService } from "../prisma/prisma.service";

@Controller("invoice")
@UseGuards(AuthGuard("jwt"))
export class InvoiceController {
  constructor(
    private readonly invoiceService: InvoiceService,
    private readonly prisma: PrismaService,
  ) {}

  @Get("my-invoices")
  async getMyInvoices(@Req() req: RequestWithUser) {
    return await this.prisma.invoice.findMany({
      where: { userId: req.user.userId },
      orderBy: { issuedAt: "desc" },
    });
  }

  @Get(":id")
  async findOne(@Param("id") id: string) {
    return await this.prisma.invoice.findUnique({ where: { id } });
  }
}
