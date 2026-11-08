import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, Res } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { SaasValidation } from "../controllers/saas-controller.utils";
import { CheckoutQuoteDto, StartCheckoutDto } from "./checkout.dto";
import { CheckoutService } from "./checkout.service";

/** Gateway posts form fields (sometimes as a query); we only read these two and verify them server-side. */
const gatewayFields = (req: Request) => {
  const src = { ...(req.query as Record<string, unknown>), ...((req.body ?? {}) as Record<string, unknown>) };
  return { tranId: String(src.tran_id ?? "").slice(0, 64), valId: String(src.val_id ?? "").slice(0, 128) };
};

/** Website checkout for SaaS plans, paid through SSLCommerz (no sign-in). */
@ApiTags("SaaS · Public")
@Controller("saas/public/checkout")
@SaasValidation()
export class PublicCheckoutController {
  constructor(private readonly checkout: CheckoutService) {}

  @Get("quote")
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: "Price + tax for ?planId, ?cycle, ?country (USD)" })
  quote(@Query() q: CheckoutQuoteDto) {
    return this.checkout.quote(q);
  }

  @Post()
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @ApiOperation({ summary: "Start a checkout → { reference, gatewayUrl } (redirect the browser to gatewayUrl)" })
  start(@Body() dto: StartCheckoutDto) {
    return this.checkout.start(dto);
  }

  // ---------------------------------------------------------------- SSLCommerz callbacks

  @Post("sslcommerz/success")
  @HttpCode(303)
  async success(@Req() req: Request, @Res() res: Response) {
    const { tranId, valId } = gatewayFields(req);
    if (tranId) await this.checkout.confirm(tranId, valId).catch(() => null);
    res.redirect(303, this.checkout.resultUrl(tranId));
  }

  @Post("sslcommerz/fail")
  async fail(@Req() req: Request, @Res() res: Response) {
    const { tranId } = gatewayFields(req);
    if (tranId) await this.checkout.close(tranId, "FAILED").catch(() => null);
    res.redirect(303, this.checkout.resultUrl(tranId));
  }

  @Post("sslcommerz/cancel")
  async cancel(@Req() req: Request, @Res() res: Response) {
    const { tranId } = gatewayFields(req);
    if (tranId) await this.checkout.close(tranId, "CANCELLED").catch(() => null);
    res.redirect(303, this.checkout.resultUrl(tranId));
  }

  @Post("sslcommerz/ipn")
  @HttpCode(200)
  @ApiOperation({ summary: "SSLCommerz IPN (server-to-server): validates and completes the checkout" })
  async ipn(@Req() req: Request) {
    const { tranId, valId } = gatewayFields(req);
    if (tranId && valId) await this.checkout.confirm(tranId, valId).catch(() => null);
    return { received: true };
  }

  @Get(":reference")
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: "Result of a checkout for the website's result page" })
  result(@Param("reference") reference: string) {
    return this.checkout.result(reference.slice(0, 64));
  }
}
