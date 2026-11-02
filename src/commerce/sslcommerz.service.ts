import { Injectable, Logger } from "@nestjs/common";
import axios from "axios";

/** A transaction SSLCommerz confirmed as paid. */
export interface GatewayTransaction {
  tranId: string;
  valId: string;
  amount: number;
  currency: string;
  bankTranId: string;
  /** e.g. "VISA-Dutch Bangla", "BKASH-BKash". */
  cardType: string;
  /** Masked card / wallet number from the gateway, e.g. "432149XXXXXX0667". */
  cardNo: string;
  raw: Record<string, unknown>;
}

const PAID_STATUSES = new Set(["VALID", "VALIDATED"]);

/**
 * SSLCommerz server-to-server APIs. Never trust the browser redirect alone — confirm every payment here.
 *  - validate(valId): Order Validation API (after the success redirect / IPN)
 *  - findPaidByTranId(tranId): Transaction Query API (admin "Verify payment")
 * SSL_IS_LIVE=true switches from the sandbox to the live gateway.
 */
@Injectable()
export class SslCommerzService {
  private readonly logger = new Logger(SslCommerzService.name);

  private get base() {
    return process.env.SSL_IS_LIVE === "true" ? "https://securepay.sslcommerz.com" : "https://sandbox.sslcommerz.com";
  }

  private get credentials() {
    return { store_id: process.env.SSL_STORE_ID ?? "", store_passwd: process.env.SSL_STORE_PASSWORD ?? "", format: "json" };
  }

  private toTransaction(d: Record<string, any>): GatewayTransaction {
    return {
      tranId: String(d.tran_id ?? ""),
      valId: String(d.val_id ?? ""),
      amount: Number(d.amount ?? d.currency_amount ?? 0),
      currency: String(d.currency_type ?? d.currency ?? ""),
      bankTranId: String(d.bank_tran_id ?? ""),
      cardType: String(d.card_type ?? ""),
      cardNo: String(d.card_no ?? ""),
      raw: d,
    };
  }

  /** Returns the transaction when SSLCommerz says `valId` is a successful payment; otherwise null. */
  async validate(valId: string): Promise<GatewayTransaction | null> {
    if (!valId) return null;
    try {
      const { data } = await axios.get(`${this.base}/validator/api/validationserverAPI.php`, {
        params: { val_id: valId, ...this.credentials },
        timeout: 15_000,
      });
      return data && PAID_STATUSES.has(String(data.status)) ? this.toTransaction(data) : null;
    } catch (err: any) {
      this.logger.error(`SSLCommerz validation failed for val_id ${valId}: ${err?.message ?? err}`);
      throw err;
    }
  }

  /** Looks up our order reference (tran_id) and returns the first successful payment, if any. */
  async findPaidByTranId(tranId: string): Promise<GatewayTransaction | null> {
    try {
      const { data } = await axios.get(`${this.base}/validator/api/merchantTransIDvalidationAPI.php`, {
        params: { tran_id: tranId, ...this.credentials },
        timeout: 15_000,
      });
      const elements: Record<string, any>[] = Array.isArray(data?.element) ? data.element : [];
      const paid = elements.find((e) => PAID_STATUSES.has(String(e.status)));
      return paid ? this.toTransaction({ tran_id: tranId, ...paid }) : null;
    } catch (err: any) {
      this.logger.error(`SSLCommerz transaction query failed for ${tranId}: ${err?.message ?? err}`);
      throw err;
    }
  }

  /** "Visa **** 0667" / "bKash **** 4521" from the gateway's card fields. */
  static maskedAccount(t: Pick<GatewayTransaction, "cardType" | "cardNo">): string {
    const brand = (t.cardType.split("-")[1] || t.cardType.split("-")[0] || "Card").trim();
    const last4 = t.cardNo.replace(/\D/g, "").slice(-4);
    return last4 ? `${brand} **** ${last4}` : brand;
  }
}
