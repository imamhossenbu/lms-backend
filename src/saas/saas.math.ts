import { LIMIT_KEYS, SAAS_TAX_RATES, TIER_PLAN_IDS, type LimitKey } from "./saas.constants";
import type { BillingCycle, InstitutionView, PlanView } from "./saas.types";

/**
 * Pure pricing / proration helpers — a 1:1 port of the frontend's src/lib/saasStats.ts
 * (priceFor, sortPlans, planRank, subscriptionPrice, planChangePreview) and mockSaasData.ts
 * (addMonthsUtc, taxFor), so the API produces exactly the numbers the UI previews.
 */

export const DAY_MS = 86_400_000;
export const round2 = (n: number) => Math.round(n * 100) / 100;
export const money = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
export const cycleLabel = (c: BillingCycle) => (c === "YEARLY" ? "yearly" : "monthly");
export const fmtDate = (d: Date) => d.toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "UTC" });
export const fmtLimitValue = (n: number, key: LimitKey) => (key === "storageGb" ? `${n.toLocaleString("en-US")} GB` : n.toLocaleString("en-US"));

const TIER_INDEX: Record<string, number> = Object.fromEntries(TIER_PLAN_IDS.map((id, i) => [id, i]));

export const priceFor = (plan: Pick<PlanView, "priceMonthly" | "priceYearly">, cycle: BillingCycle) =>
  cycle === "YEARLY" ? plan.priceYearly : plan.priceMonthly;

/** Country rate when known, otherwise `fallbackPct` (Console settings › Billing › tax rate, default 0). */
export const taxFor = (country: string, amount: number, fallbackPct = 0) => Math.round(amount * (SAAS_TAX_RATES[country] ?? fallbackPct / 100) * 100) / 100;

/** Adds calendar months in UTC, clamping the day (Jan 31 + 1 month → Feb 28/29). */
export function addMonthsUtc(from: Date, months: number): Date {
  const day = from.getUTCDate();
  const target = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + months, 1, from.getUTCHours(), from.getUTCMinutes(), from.getUTCSeconds()));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target;
}

export const periodEndFrom = (start: Date, cycle: BillingCycle) => addMonthsUtc(start, cycle === "YEARLY" ? 12 : 1);

/** By monthly price ascending; custom-priced (0) last; ties → tier order, then name. */
export function sortPlans<T extends Pick<PlanView, "id" | "name" | "priceMonthly">>(plans: T[]): T[] {
  const key = (p: T) => (p.priceMonthly > 0 ? p.priceMonthly : Number.POSITIVE_INFINITY);
  return [...plans].sort((a, b) => key(a) - key(b) || (TIER_INDEX[a.id] ?? 99) - (TIER_INDEX[b.id] ?? 99) || a.name.localeCompare(b.name));
}

export const planRank = (plans: PlanView[], id: string) => sortPlans(plans).findIndex((p) => p.id === id);

/** Price per billing cycle for this institution (custom deals use `customPrice`). */
export function subscriptionPrice(plans: PlanView[], inst: InstitutionView) {
  const custom = inst.subscription.customPrice;
  if (custom !== null && custom > 0) return custom;
  const plan = plans.find((p) => p.id === inst.subscription.planId);
  return plan ? priceFor(plan, inst.subscription.cycle) : 0;
}

export interface PlanChangePreview {
  kind: "UPGRADE" | "DOWNGRADE" | "CYCLE" | "SAME";
  currentPrice: number;
  nextPrice: number;
  currentMonthly: number;
  nextMonthly: number;
  dueNow: number;
  credit: number;
  resetsPeriod: boolean;
  blockers: { key: LimitKey; usage: number; limit: number }[];
  trialing: boolean;
}

/** Upgrades are prorated against the unused part of the period; a cycle switch starts a new period now. */
export function planChangePreview(plans: PlanView[], inst: InstitutionView, planId: string, cycle: BillingCycle, now = Date.now()): PlanChangePreview {
  const s = inst.subscription;
  const target = plans.find((p) => p.id === planId);
  const currentPrice = subscriptionPrice(plans, inst);
  const sameCustom = planId === s.planId && s.customPrice ? s.customPrice : null;
  const nextPrice = sameCustom ?? (target ? priceFor(target, cycle) : 0);
  const currentMonthly = s.cycle === "YEARLY" ? currentPrice / 12 : currentPrice;
  const nextMonthly = cycle === "YEARLY" ? nextPrice / 12 : nextPrice;
  const blockers = target
    ? LIMIT_KEYS.flatMap((key) => {
        const limit = target.limits[key];
        return limit !== null && inst.usage[key] > limit ? [{ key, usage: inst.usage[key], limit }] : [];
      })
    : [];
  const kind: PlanChangePreview["kind"] =
    planId === s.planId && cycle === s.cycle
      ? "SAME"
      : planRank(plans, planId) > planRank(plans, s.planId)
        ? "UPGRADE"
        : planRank(plans, planId) < planRank(plans, s.planId)
          ? "DOWNGRADE"
          : "CYCLE";
  const trialing = s.status === "TRIALING";
  const start = new Date(s.currentPeriodStart).getTime();
  const end = new Date(s.currentPeriodEnd).getTime();
  const remaining = end > start ? Math.min(1, Math.max(0, (end - now) / (end - start))) : 0;
  const credit = trialing ? 0 : round2(currentPrice * remaining);
  const resetsPeriod = !trialing && cycle !== s.cycle;
  let dueNow = 0;
  if (!trialing && kind !== "SAME") {
    if (resetsPeriod) dueNow = Math.max(0, round2(nextPrice - credit));
    else if (kind === "UPGRADE") dueNow = Math.max(0, round2((nextPrice - currentPrice) * remaining));
  }
  return { kind, currentPrice, nextPrice, currentMonthly, nextMonthly, dueNow, credit, resetsPeriod, blockers, trialing };
}

export const initialsOf = (name: string) =>
  name
    .replace(/[^A-Za-z ]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "IN";
