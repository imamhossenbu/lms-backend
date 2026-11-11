import { Controller, HttpCode, Post, Req, Res } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { AcademyCheckoutService } from "./academy-checkout.service";

const gatewayFields = (req: Request) => {
  const src = { ...(req.query as Record<string, unknown>), ...((req.body ?? {}) as Record<string, unknown>) };
  return { tranId: String(src.tran_id ?? "").slice(0, 64), valId: String(src.val_id ?? "").slice(0, 128) };
};

/**
 * SSLCommerz callbacks for academy course purchases. The browser-posted body is never trusted: success / IPN
 * re-validate val_id server-to-server. The browser is then sent back to the academy site's result page.
 */
@ApiExcludeController()
@Controller("academy/checkout/sslcommerz")
export class AcademyCheckoutCallbackController {
  constructor(private readonly checkout: AcademyCheckoutService) {}

  @Post("success")
  async success(@Req() req: Request, @Res() res: Response) {
    const { tranId, valId } = gatewayFields(req);
    if (tranId) await this.checkout.confirm(tranId, valId).catch(() => null);
    res.redirect(303, await this.checkout.returnUrl(tranId));
  }

  @Post("fail")
  async fail(@Req() req: Request, @Res() res: Response) {
    const { tranId } = gatewayFields(req);
    if (tranId) await this.checkout.close(tranId, "FAILED").catch(() => null);
    res.redirect(303, await this.checkout.returnUrl(tranId));
  }

  @Post("cancel")
  async cancel(@Req() req: Request, @Res() res: Response) {
    const { tranId } = gatewayFields(req);
    if (tranId) await this.checkout.close(tranId, "CANCELLED").catch(() => null);
    res.redirect(303, await this.checkout.returnUrl(tranId));
  }

  @Post("ipn")
  @HttpCode(200)
  async ipn(@Req() req: Request) {
    const { tranId, valId } = gatewayFields(req);
    if (tranId && valId) await this.checkout.confirm(tranId, valId).catch(() => null);
    return { received: true };
  }
}
