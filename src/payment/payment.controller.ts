import { Controller, Post, Body, UseGuards, Param, Req } from "@nestjs/common";
import { Request } from "express";
import { PaymentService } from "./payment.service";
import { AuthGuard } from "@nestjs/passport";

@Controller("payments")
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @UseGuards(AuthGuard("jwt"))
  @Post("initiate")
  async initiate(@Req() req: Request, @Body("orderId") orderId: string) {
    return await this.paymentService.initiatePayment(
      (req as any).user.userId,
      orderId,
    );
  }

  @Post("success/:orderId")
  async handleSuccess(@Param("orderId") orderId: string, @Body() body: any) {
    return await this.paymentService.recordPayment(orderId, body.val_id, body);
  }
}
