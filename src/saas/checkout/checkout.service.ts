import { BadGatewayException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import axios from "axios";
import * as bcrypt from "bcrypt";
import { randomBytes } from "crypto";
import type { SaasCheckout } from "../../../generated/prisma";
import { SslCommerzService } from "../../commerce/sslcommerz.service";
import { SAAS_ROOT_DOMAIN } from "../saas.constants";
import { priceFor, round2 } from "../saas.math";
import type { BillingCycle } from "../saas.types";
import { SaasCoreService } from "../services/saas-core.service";
import { SaasInstitutionsService } from "../services/saas-institutions.service";
import type { CheckoutQuoteDto, StartCheckoutDto } from "./checkout.dto";

export interface CheckoutQuote {
  planId: string;
  planName: string;
  cycle: BillingCycle;
  subtotal: number;
  tax: number;
  total: number;
  currency: "USD";
}

/** What the website's result page may show (no secrets, email masked). */
export interface CheckoutResultView {
  reference: string;
  status: "PENDING" | "PAID" | "FAILED" | "CANCELLED";
  planId: string;
  planName: string;
  cycle: BillingCycle;
  total: number;
  currency: string;
  institutionName: string;
  subdomain: string;
  email: string;
  paidAt: string | null;
  error: string;
}

const API_PUBLIC_URL = () => (process.env.API_PUBLIC_URL || `http://localhost:${process.env.PORT || 4000}`).replace(/\/$/, "");
const WEBSITE_URL = () => (process.env.WEBSITE_URL || "http://localhost:3002").replace(/\/$/, "");
const gatewayBase = () => (process.env.SSL_IS_LIVE === "true" ? "https://securepay.sslcommerz.com" : "https://sandbox.sslcommerz.com");
const maskEmail = (e: string) => e.replace(/^(.)(.*)(@.*)$/, (_m, a: string, b: string, c: string) => `${a}${"•".repeat(Math.min(6, b.length))}${c}`);

/**
 * Website checkout for SaaS plans through SSLCommerz:
 *  1. start(): validate details, price the plan (+ tax), save a PENDING checkout, open a gateway session → GatewayPageURL
 *  2. the gateway redirects the browser to success / fail / cancel (and calls the IPN server-to-server)
 *  3. confirm(): the payment is checked with SSLCommerz's validation API (tran_id, amount, currency) before the
 *     academy, its admin and the PAID invoice are created — idempotent, so the redirect and the IPN can both arrive.
 */
@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    private readonly core: SaasCoreService,
    private readonly institutions: SaasInstitutionsService,
    private readonly ssl: SslCommerzService,
  ) {}

  async quote(q: CheckoutQuoteDto): Promise<CheckoutQuote> {
    const plan = await this.core.mustPlan(this.core.prisma, q.planId);
    if (plan.archived || !plan.isPublic) throw new NotFoundException("This plan isn't available to buy online.");
    const subtotal = round2(priceFor(plan, q.cycle));
    const tax = await this.core.taxOn(this.core.prisma, q.country, subtotal);
    return { planId: plan.id, planName: plan.name, cycle: q.cycle, subtotal, tax, total: round2(subtotal + tax), currency: "USD" };
  }

  async start(dto: StartCheckoutDto): Promise<{ reference: string; gatewayUrl: string }> {
    if (!process.env.SSL_STORE_ID || !process.env.SSL_STORE_PASSWORD) throw new ServiceUnavailableException("Online payment isn't set up yet. Please contact us to subscribe.");
    await this.institutions.assertCanBuy({ email: dto.email, slug: dto.slug, planId: dto.planId });
    const q = await this.quote(dto);
    if (q.total <= 0) throw new NotFoundException("This plan has no online price — please contact sales.");

    const tranId = `EDP-${Date.now().toString(36).toUpperCase()}-${randomBytes(4).toString("hex").toUpperCase()}`;
    const checkout = await this.core.prisma.saasCheckout.create({
      data: {
        tranId,
        planId: q.planId,
        cycle: q.cycle,
        subtotal: q.subtotal,
        tax: q.tax,
        total: q.total,
        currency: q.currency,
        name: dto.name.trim(),
        email: dto.email.trim().toLowerCase(),
        phone: dto.phone,
        passwordHash: await bcrypt.hash(dto.password, 10),
        institutionName: dto.institutionName.trim(),
        institutionType: dto.type,
        country: dto.country,
        slug: dto.slug.trim().toLowerCase(),
      },
    });

    const cb = `${API_PUBLIC_URL()}/saas/public/checkout/sslcommerz`;
    const form = new URLSearchParams({
      store_id: process.env.SSL_STORE_ID,
      store_passwd: process.env.SSL_STORE_PASSWORD,
      total_amount: q.total.toFixed(2),
      currency: q.currency,
      tran_id: tranId,
      success_url: `${cb}/success`,
      fail_url: `${cb}/fail`,
      cancel_url: `${cb}/cancel`,
      ipn_url: `${cb}/ipn`,
      cus_name: checkout.name,
      cus_email: checkout.email,
      cus_phone: checkout.phone,
      cus_add1: checkout.institutionName,
      cus_city: checkout.country === "Bangladesh" ? "Dhaka" : "N/A",
      cus_country: checkout.country,
      shipping_method: "NO",
      num_of_item: "1",
      product_name: `EduPro ${q.planName} plan (${q.cycle === "YEARLY" ? "yearly" : "monthly"})`,
      product_category: "Software subscription",
      product_profile: "non-physical-goods",
      value_a: checkout.id,
    });
    try {
      const { data } = await axios.post(`${gatewayBase()}/gwprocess/v4/api.php`, form.toString(), { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 20_000 });
      if (data?.status !== "SUCCESS" || !data?.GatewayPageURL) throw new Error(String(data?.failedreason || data?.status || "no gateway URL"));
      return { reference: tranId, gatewayUrl: String(data.GatewayPageURL) };
    } catch (err: any) {
      this.logger.error(`SSLCommerz session failed for ${tranId}: ${err?.message ?? err}`);
      await this.core.prisma.saasCheckout.update({ where: { id: checkout.id }, data: { status: "FAILED", error: "The payment page couldn't be opened." } });
      throw new BadGatewayException("We couldn't open the payment page. Please try again in a moment.");
    }
  }

  /**
   * Gateway success redirect / IPN: validates `valId` with SSLCommerz and, when it is a real payment for this
   * checkout's tran_id, amount and currency, creates the academy. Safe to call more than once.
   */
  async confirm(tranId: string, valId: string): Promise<SaasCheckout> {
    const c = await this.mustFind(tranId);
    if (c.status === "PAID") return c;
    const tx = valId ? await this.ssl.validate(valId).catch(() => null) : null;
    const raw = (tx?.raw ?? {}) as Record<string, unknown>;
    const paidAmount = Number(raw.currency_amount ?? raw.amount ?? 0);
    const paidCurrency = String(raw.currency_type ?? raw.currency ?? "");
    const ok = !!tx && tx.tranId === c.tranId && paidCurrency === c.currency && Math.abs(paidAmount - c.total) < 0.01;
    if (!ok) {
      this.logger.warn(`Checkout ${tranId}: payment not confirmed (val_id ${valId || "—"}, ${paidCurrency} ${paidAmount})`);
      return this.core.prisma.saasCheckout.update({ where: { id: c.id }, data: { status: "FAILED", error: "The payment couldn't be confirmed with the gateway." } });
    }

    try {
      const { result, otp } = await this.core.tx(async (db) => {
        // Re-read inside the transaction so a concurrent IPN + redirect create the academy only once.
        const fresh = await db.saasCheckout.findUnique({ where: { id: c.id } });
        if (!fresh || fresh.status === "PAID") return { result: fresh!, otp: null };
        const { institution, otp } = await this.institutions.createFromPaidCheckout(db, {
          name: fresh.name,
          email: fresh.email,
          passwordHash: fresh.passwordHash,
          phone: fresh.phone,
          institutionName: fresh.institutionName,
          institutionType: fresh.institutionType,
          country: fresh.country,
          slug: fresh.slug,
          planId: fresh.planId,
          cycle: fresh.cycle as BillingCycle,
          subtotal: fresh.subtotal,
          tranId: fresh.tranId,
          cardType: tx!.cardType,
        });
        const result = await db.saasCheckout.update({
          where: { id: fresh.id },
          data: { status: "PAID", institutionId: institution.id, valId: tx!.valId, bankTranId: tx!.bankTranId, cardType: tx!.cardType, paidAt: new Date(), error: "" },
        });
        return { result, otp };
      });
      if (otp) await this.institutions.sendVerification(result.email, otp);
      return result;
    } catch (err: any) {
      // Paid, but the academy couldn't be created (e.g. the subdomain was taken meanwhile) — keep the payment on record for support.
      this.logger.error(`Checkout ${tranId}: paid but setup failed: ${err?.message ?? err}`);
      return this.core.prisma.saasCheckout.update({
        where: { id: c.id },
        data: { status: "FAILED", valId: tx!.valId, bankTranId: tx!.bankTranId, cardType: tx!.cardType, error: "Payment received, but we couldn't finish setting up your academy. Our team will contact you — no need to pay again." },
      });
    }
  }

  /** Gateway fail / cancel redirect: closes a still-pending checkout. */
  async close(tranId: string, status: "FAILED" | "CANCELLED") {
    const c = await this.core.prisma.saasCheckout.findUnique({ where: { tranId } });
    if (!c || c.status !== "PENDING") return c;
    return this.core.prisma.saasCheckout.update({ where: { id: c.id }, data: { status, error: status === "CANCELLED" ? "You cancelled the payment." : "The payment didn't go through." } });
  }

  async result(tranId: string): Promise<CheckoutResultView> {
    const c = await this.mustFind(tranId);
    const plan = await this.core.mustPlan(this.core.prisma, c.planId).catch(() => null);
    return {
      reference: c.tranId,
      status: c.status as CheckoutResultView["status"],
      planId: c.planId,
      planName: plan?.name ?? c.planId,
      cycle: c.cycle as BillingCycle,
      total: c.total,
      currency: c.currency,
      institutionName: c.institutionName,
      subdomain: `${c.slug}.${SAAS_ROOT_DOMAIN}`,
      email: maskEmail(c.email),
      paidAt: c.paidAt?.toISOString() ?? null,
      error: c.error,
    };
  }

  /** Website page the browser lands on after the gateway. */
  resultUrl(tranId: string) {
    return `${WEBSITE_URL()}/checkout/result?ref=${encodeURIComponent(tranId)}`;
  }

  private async mustFind(tranId: string) {
    const c = await this.core.prisma.saasCheckout.findUnique({ where: { tranId } });
    if (!c) throw new NotFoundException("This checkout doesn't exist.");
    return c;
  }
}
