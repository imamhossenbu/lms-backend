import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { statusLabel, TRANSITIONS } from "../commerce/order-status";
import { SslCommerzService } from "../commerce/sslcommerz.service";
import { ChangeStatusDto, CreateOrderDto, EditPaymentDto, OrderQueryDto } from "./dto/orders.dto";

const messages = (cls: any, body: object) => validateSync(plainToInstance(cls, body), { whitelist: true }).flatMap((e) => Object.values(e.constraints ?? {}));

describe("order lifecycle rules", () => {
  it("maps DB spellings to panel labels", () => {
    expect(statusLabel("PAID")).toBe("Paid");
    expect(statusLabel("delivered")).toBe("Paid");
    expect(statusLabel("CANCELED")).toBe("Cancelled");
    expect(statusLabel("weird")).toBe("Pending");
  });

  it("matches the panel's transition table", () => {
    expect(TRANSITIONS.order.Pending).toEqual(["Paid", "Failed", "Cancelled"]);
    expect(TRANSITIONS.order.Paid).toEqual([]); // refunds only from Payments
    expect(TRANSITIONS.payment.Paid).toEqual(["Refunded"]);
    expect(TRANSITIONS.payment.Cancelled).toEqual([]);
  });

  it("masks gateway accounts", () => {
    expect(SslCommerzService.maskedAccount({ cardType: "VISA-Dutch Bangla", cardNo: "432149XXXXXX0667" })).toBe("Dutch Bangla **** 0667");
    expect(SslCommerzService.maskedAccount({ cardType: "BKASH-BKash", cardNo: "" })).toBe("BKash");
  });
});

describe("order DTOs", () => {
  it("requires payment details only when marking paid", () => {
    expect(messages(ChangeStatusDto, { target: "Paid", method: "bKash", reference: "TRX-9981", paidOn: "2026-11-01" })).toHaveLength(0);
    expect(messages(ChangeStatusDto, { target: "Paid" })).toEqual(expect.arrayContaining(["Please select a payment method", "Reference must be 4–40 characters", "Please pick the payment date"]));
    expect(messages(ChangeStatusDto, { target: "Pending" })).toHaveLength(0);
  });

  it("requires a preset reason for destructive targets", () => {
    expect(messages(ChangeStatusDto, { target: "Refunded", reason: "Duplicate payment" })).toHaveLength(0);
    expect(messages(ChangeStatusDto, { target: "Cancelled", reason: "Because" })).toContain("Please select a reason");
    expect(messages(ChangeStatusDto, { target: "Shipped" })).toContain("Please choose a valid status");
  });

  it("validates manual orders", () => {
    const base = { studentId: "3f2a9c1e-1111-4222-8333-444455556666", courseId: "3f2a9c1e-1111-4222-8333-444455556667", method: "bKash" };
    expect(messages(CreateOrderDto, { ...base, markAsPaid: false })).toHaveLength(0);
    expect(messages(CreateOrderDto, { ...base, markAsPaid: true, reference: "a b" })).toEqual(expect.arrayContaining(["Reference must be 4–40 characters"]));
    expect(messages(CreateOrderDto, { ...base, method: "Cash", markAsPaid: false, couponCode: "BAD CODE!" })).toEqual(
      expect.arrayContaining(["Please select a payment method", "Use letters, numbers, dashes or underscores only"]),
    );
  });

  it("validates payment edits and list queries", () => {
    expect(messages(EditPaymentDto, { method: "Nagad", account: "Nagad 017** ***678" })).toHaveLength(0);
    expect(messages(EditPaymentDto, { method: "Nagad", account: "x" })).toContain("Account details must be at least 4 characters");
    const q = plainToInstance(OrderQueryDto, { page: "2", limit: "20", view: "Cancelled", from: "2026-10-01" });
    expect(validateSync(q)).toHaveLength(0);
    expect([q.page, q.limit, q.sortBy]).toEqual([2, 20, "createdAt"]);
    expect(messages(OrderQueryDto, { status: "Shipped", limit: "500" })).toEqual(
      expect.arrayContaining(["status must be Paid, Pending, Failed, Cancelled or Refunded", "limit can be at most 100"]),
    );
  });
});
