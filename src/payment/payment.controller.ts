import { Controller, Post, Body, UseGuards, Param, Req } from "@nestjs/common";
import { Request } from "express";
import { PaymentService } from "./payment.service";
import { AuthGuard } from "@nestjs/passport";

@Controller("payments")
@UseGuards(AuthGuard("jwt"))
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post("initiate")
  async initiate(@Req() req: Request, @Body("orderId") orderId: string) {
    return await this.paymentService.initiatePayment(
      (req as any).user.id,
      orderId,
    );
  }

  @Post("success/:orderId")
  async handleSuccess(@Param("orderId") orderId: string, @Body() body: any) {
    return await this.paymentService.recordPayment(orderId, body.val_id, body);
  }
}
