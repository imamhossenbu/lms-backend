import type { Prisma } from "../../../generated/prisma";
import { couponTerms } from "./coupon.mapper";
import { invoiceDiscount, usageUpdate } from "./coupon.rules";
import type { AppliedDiscount, InvoiceLine } from "./coupons.types";

type Tx = Prisma.TransactionClient;

/**
 * Coupon pricing hooks used by the SaaS billing flows (plain functions taking the caller's transaction,
 * so SaasCoreService can use them without a DI cycle):
 *   quoteDiscount  — before charging: what the institution's running coupon takes off this invoice line
 *   recordDiscount — inside addInvoice: books the discount on the redemption (ONCE ends, REPEATING window starts)
 */

/** The institution's running redemption that discounts this line (oldest first), or null. */
export async function quoteDiscount(tx: Tx, institutionId: string, line: InvoiceLine): Promise<AppliedDiscount | null> {
  const running = await tx.saasCouponRedemption.findMany({
    where: { institutionId, endedAt: null },
    include: { coupon: true },
    orderBy: { at: "asc" },
  });
  for (const r of running) {
    const amount = invoiceDiscount(couponTerms(r.coupon), r, line);
    if (amount > 0) return { redemptionId: r.id, code: r.coupon.code, amount };
  }
  return null;
}

export async function recordDiscount(tx: Tx, discount: AppliedDiscount, at: Date): Promise<void> {
  const r = await tx.saasCouponRedemption.findUnique({ where: { id: discount.redemptionId }, include: { coupon: true } });
  if (!r) return;
  const u = usageUpdate(r.coupon, r, at, discount.amount);
  await tx.saasCouponRedemption.update({
    where: { id: r.id },
    data: { invoicesApplied: u.invoicesApplied, amountOff: { increment: u.amountOffIncrement }, endedAt: u.endedAt, discountEndsAt: u.discountEndsAt },
  });
}
