/**
 * API response shapes — identical to the frontend contract (src/types/saas.ts in both frontends),
 * so the console / panel can swap their localStorage store for the API without reshaping data.
 * All timestamps are ISO-8601 strings, money is a plain number (USD).
 */
import type { FeatureKey, LimitKey, PaymentBrand } from "./saas.constants";

export type BillingCycle = "MONTHLY" | "YEARLY";
export type SubscriptionStatus = "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELLED" | "SUSPENDED";
export type InvoiceStatus = "PAID" | "OPEN" | "FAILED" | "REFUNDED" | "VOID";

export interface PlanView {
  id: string;
  name: string;
  tagline: string;
  priceMonthly: number;
  priceYearly: number;
  limits: Record<LimitKey, number | null>;
  features: FeatureKey[];
  highlighted: boolean;
  isPublic: boolean;
  trialDays: number;
  archived: boolean;
  updatedAt: string;
}

export interface PaymentMethodView {
  brand: PaymentBrand;
  last4: string;
}

export interface SubscriptionView {
  planId: string;
  cycle: BillingCycle;
  status: SubscriptionStatus;
  startedAt: string;
  trialEndsAt: string | null;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  cancelledAt: string | null;
  suspendedAt: string | null;
  suspendedReason: string | null;
  statusBeforeSuspend: Exclude<SubscriptionStatus, "SUSPENDED"> | null;
  customPrice: number | null;
  paymentMethod: PaymentMethodView | null;
}

export interface CustomDomainView {
  domain: string;
  status: "PENDING_DNS" | "VERIFIED" | "FAILED";
  addedAt: string;
  verifiedAt: string | null;
  dnsTarget: string;
  txtToken: string;
  lastCheckedAt: string | null;
}

export interface InstitutionView {
  id: string;
  name: string;
  slug: string;
  logoInitials: string;
  tone: string;
  type: string;
  country: string;
  ownerName: string;
  ownerEmail: string;
  phone: string;
  createdAt: string;
  lastActiveAt: string;
  subscription: SubscriptionView;
  customDomain: CustomDomainView | null;
  usage: Record<LimitKey, number>;
  notes: string;
  source: "SELF_SIGNUP" | "OWNER_CREATED";
}

export interface InvoiceView {
  id: string;
  number: string;
  institutionId: string;
  planId: string;
  cycle: BillingCycle;
  amount: number;
  tax: number;
  total: number;
  status: InvoiceStatus;
  issuedAt: string;
  dueAt: string;
  paidAt: string | null;
  periodStart: string;
  periodEnd: string;
  description?: string;
}

export interface EventView {
  id: string;
  institutionId: string;
  type: string;
  message: string;
  at: string;
  actor: "Owner" | "Institution" | "System";
}

export interface SaasSnapshot {
  plans: PlanView[];
  institutions: InstitutionView[];
  invoices: InvoiceView[];
  events: EventView[];
}

/** Who performed a mutation — recorded as the event actor. */
export type SaasActorKind = "Owner" | "Institution" | "System";
