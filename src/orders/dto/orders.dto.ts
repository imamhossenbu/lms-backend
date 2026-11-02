import { IntersectionType } from "@nestjs/mapped-types";
import { Transform } from "class-transformer";
import { IsBoolean, IsDateString, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength, ValidateIf } from "class-validator";
import { ORDER_STATUS_LABELS, PAYMENT_METHODS, STATUS_REASONS, statusNeedsReason, type OrderStatusLabel, type PaymentMethodLabel } from "../../commerce/order-status";
import { PaginationQueryDto } from "../../common/pagination";

const trim = () => Transform(({ value }) => (typeof value === "string" ? value.trim() : value));
const REF_RE = /^[A-Za-z0-9_-]+$/;
const REF_MSG = "Use letters, numbers, dashes or underscores only";

export const REFERRAL_SOURCES = ["Google Ads", "Facebook", "Organic Search", "Referral", "Direct", "Other"] as const;
/** The panel's "Order Status" column labels. */
export const ORDER_VIEWS = ["Completed", "Processing", "Cancelled", "Refunded"] as const;
export type OrderView = (typeof ORDER_VIEWS)[number];

// ---------------------------------------------------------------- list / stats

export class OrderFiltersDto {
  /** Order number, transaction id, student name or email. */
  @IsOptional() @trim() @IsString() @MaxLength(100) q?: string;

  /** Payment Status column (lifecycle label). */
  @IsOptional() @IsIn(ORDER_STATUS_LABELS, { message: "status must be Paid, Pending, Failed, Cancelled or Refunded" }) status?: OrderStatusLabel;

  /** Order Status column: Completed / Processing / Cancelled (incl. failed) / Refunded. */
  @IsOptional() @IsIn(ORDER_VIEWS, { message: "view must be Completed, Processing, Cancelled or Refunded" }) view?: OrderView;

  @IsOptional() @IsUUID("all", { message: "courseId must be a valid id" }) courseId?: string;
  @IsOptional() @IsIn(PAYMENT_METHODS, { message: "Unknown payment method" }) method?: PaymentMethodLabel;
  @IsOptional() @IsDateString({}, { message: "from must be a date (yyyy-mm-dd)" }) from?: string;
  @IsOptional() @IsDateString({}, { message: "to must be a date (yyyy-mm-dd)" }) to?: string;
}

/** Filters + `page` / `limit` (shared PaginationQueryDto) + sort. */
export class OrderQueryDto extends IntersectionType(PaginationQueryDto, OrderFiltersDto) {
  @IsOptional() @IsIn(["createdAt", "amount"]) sortBy: "createdAt" | "amount" = "createdAt";
  @IsOptional() @IsIn(["asc", "desc"]) sortOrder: "asc" | "desc" = "desc";
}

// ---------------------------------------------------------------- create (manual order)

export class CreateOrderDto {
  @IsUUID("all", { message: "Please select a student" }) studentId!: string;
  @IsUUID("all", { message: "Please select a course" }) courseId!: string;
  @IsIn(PAYMENT_METHODS, { message: "Please select a payment method" }) method!: PaymentMethodLabel;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(20, { message: "Coupon code cannot exceed 20 characters" })
  @Matches(/^[A-Za-z0-9_-]*$/, { message: REF_MSG })
  couponCode?: string;

  @IsBoolean() markAsPaid!: boolean;

  @ValidateIf((o: CreateOrderDto) => o.markAsPaid)
  @trim()
  @IsString({ message: "Reference must be 4–40 characters" })
  @MinLength(4, { message: "Reference must be 4–40 characters" })
  @MaxLength(40, { message: "Reference must be 4–40 characters" })
  @Matches(REF_RE, { message: REF_MSG })
  reference?: string;

  @IsOptional() @trim() @IsString() @MaxLength(300, { message: "Note cannot exceed 300 characters" }) note?: string;
}

// ---------------------------------------------------------------- change status

const isPaid = (o: ChangeStatusDto) => o.target === "Paid";

export class ChangeStatusDto {
  @IsIn(ORDER_STATUS_LABELS, { message: "Please choose a valid status" }) target!: OrderStatusLabel;

  // target = Paid
  @ValidateIf(isPaid) @IsIn(PAYMENT_METHODS, { message: "Please select a payment method" }) method?: PaymentMethodLabel;

  @ValidateIf(isPaid)
  @trim()
  @IsString({ message: "Reference must be 4–40 characters" })
  @MinLength(4, { message: "Reference must be 4–40 characters" })
  @MaxLength(40, { message: "Reference must be 4–40 characters" })
  @Matches(REF_RE, { message: REF_MSG })
  reference?: string;

  /** yyyy-mm-dd, not in the future (checked in the service). */
  @ValidateIf(isPaid) @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "Please pick the payment date" }) paidOn?: string;

  // target = Failed / Cancelled / Refunded
  @ValidateIf((o: ChangeStatusDto) => statusNeedsReason(o.target))
  @IsIn(Object.values(STATUS_REASONS).flat(), { message: "Please select a reason" })
  reason?: string;

  @IsOptional() @trim() @IsString() @MaxLength(300, { message: "Details cannot exceed 300 characters" }) details: string = "";
}

// ---------------------------------------------------------------- other edits

export class AdditionalInfoDto {
  @IsIn(REFERRAL_SOURCES, { message: "Please select a referral source" }) referralSource!: string;

  /** Shown for reference; coupons can't be changed once the order exists (checked in the service). */
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(20, { message: "Coupon code cannot exceed 20 characters" })
  @Matches(/^[A-Za-z0-9_-]*$/, { message: REF_MSG })
  couponCode?: string;

  @IsOptional() @trim() @IsString() @MaxLength(300, { message: "Notes cannot exceed 300 characters" }) notes?: string;
}

export class EditPaymentDto {
  @IsIn(PAYMENT_METHODS, { message: "Please select a payment method" }) method!: PaymentMethodLabel;

  @trim()
  @IsString()
  @MinLength(4, { message: "Account details must be at least 4 characters" })
  @MaxLength(40, { message: "Account details cannot exceed 40 characters" })
  account!: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(40, { message: "Reference cannot exceed 40 characters" })
  @Matches(/^[A-Za-z0-9_-]*$/, { message: REF_MSG })
  reference?: string;
}

export class CommerceNoteDto {
  @trim()
  @IsString()
  @MinLength(3, { message: "Note must be at least 3 characters" })
  @MaxLength(500, { message: "Note cannot exceed 500 characters" })
  content!: string;
}
