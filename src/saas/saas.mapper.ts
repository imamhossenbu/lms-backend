import type { CustomDomain, Institution, SaasEvent, SaasInvoice, SaasPlan } from "../../generated/prisma";
import type { FeatureKey, PaymentBrand } from "./saas.constants";
import type { CustomDomainView, EventView, InstitutionView, InvoiceView, PlanView } from "./saas.types";

/** Prisma rows → API views (frontend contract shape). */

const num = (d: { toNumber(): number } | number | null | undefined) => (d === null || d === undefined ? 0 : typeof d === "number" ? d : d.toNumber());
const iso = (d: Date) => d.toISOString();
const isoOrNull = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export function toPlanView(p: SaasPlan): PlanView {
  return {
    id: p.id,
    name: p.name,
    tagline: p.tagline,
    priceMonthly: num(p.priceMonthly),
    priceYearly: num(p.priceYearly),
    limits: {
      students: p.limitStudents,
      courses: p.limitCourses,
      teamMembers: p.limitTeamMembers,
      storageGb: p.limitStorageGb,
    },
    features: p.features as FeatureKey[],
    highlighted: p.highlighted,
    isPublic: p.isPublic,
    trialDays: p.trialDays,
    archived: p.archived,
    updatedAt: iso(p.updatedAt),
  };
}

export function toDomainView(d: CustomDomain | null | undefined): CustomDomainView | null {
  if (!d) return null;
  return {
    domain: d.domain,
    status: d.status,
    addedAt: iso(d.addedAt),
    verifiedAt: isoOrNull(d.verifiedAt),
    dnsTarget: d.dnsTarget,
    txtToken: d.txtToken,
    lastCheckedAt: isoOrNull(d.lastCheckedAt),
  };
}

export type InstitutionRow = Institution & { customDomain?: CustomDomain | null };

export function toInstitutionView(i: InstitutionRow): InstitutionView {
  return {
    id: i.id,
    name: i.name,
    slug: i.slug,
    logoInitials: i.logoInitials,
    tone: i.tone,
    type: i.type,
    country: i.country,
    ownerName: i.ownerName,
    ownerEmail: i.ownerEmail,
    phone: i.phone,
    createdAt: iso(i.createdAt),
    lastActiveAt: iso(i.lastActiveAt),
    subscription: {
      planId: i.planId,
      cycle: i.cycle,
      status: i.status,
      startedAt: iso(i.startedAt),
      trialEndsAt: isoOrNull(i.trialEndsAt),
      currentPeriodStart: iso(i.currentPeriodStart),
      currentPeriodEnd: iso(i.currentPeriodEnd),
      cancelAtPeriodEnd: i.cancelAtPeriodEnd,
      cancelledAt: isoOrNull(i.cancelledAt),
      suspendedAt: isoOrNull(i.suspendedAt),
      suspendedReason: i.suspendedReason,
      statusBeforeSuspend: i.statusBeforeSuspend === "SUSPENDED" ? null : i.statusBeforeSuspend,
      customPrice: i.customPrice === null ? null : num(i.customPrice),
      paymentMethod: i.paymentBrand && i.paymentLast4 ? { brand: i.paymentBrand as PaymentBrand, last4: i.paymentLast4 } : null,
    },
    customDomain: toDomainView(i.customDomain),
    usage: {
      students: i.usageStudents,
      courses: i.usageCourses,
      teamMembers: i.usageTeamMembers,
      storageGb: i.usageStorageGb,
    },
    notes: i.notes,
    source: i.source,
  };
}

export function toInvoiceView(v: SaasInvoice): InvoiceView {
  return {
    id: v.id,
    number: v.number,
    institutionId: v.institutionId,
    planId: v.planId,
    cycle: v.cycle,
    amount: num(v.amount),
    tax: num(v.tax),
    total: num(v.total),
    status: v.status,
    issuedAt: iso(v.issuedAt),
    dueAt: iso(v.dueAt),
    paidAt: isoOrNull(v.paidAt),
    periodStart: iso(v.periodStart),
    periodEnd: iso(v.periodEnd),
    ...(v.description ? { description: v.description } : {}),
    discount: num(v.discount),
    couponCode: v.couponCode,
  };
}

export function toEventView(e: SaasEvent): EventView {
  return { id: e.id, institutionId: e.institutionId, type: e.type, message: e.message, at: iso(e.at), actor: e.actor };
}
