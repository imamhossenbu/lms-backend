import { Injectable } from "@nestjs/common";
import type { PaymentMethodView } from "../saas.types";

export type ChargeResult = { ok: true } | { ok: false; reason: "NO_PAYMENT_METHOD" | "DECLINED" };

/**
 * Subscription charging. Placeholder until a real gateway (SSLCommerz / Stripe) is wired:
 * declines when there is no payment method or the card ends in 0002 (test decline card) — same as the mock store.
 * Replace `charge()` only; callers already handle both outcomes.
 */
@Injectable()
export class SaasPaymentGateway {
  async charge(pm: PaymentMethodView | null, _amount: number): Promise<ChargeResult> {
    if (!pm) return { ok: false, reason: "NO_PAYMENT_METHOD" };
    if (pm.last4 === "0002") return { ok: false, reason: "DECLINED" };
    return { ok: true };
  }
}
