import { LIMIT_KEYS, type LimitKey } from "../saas.constants";
import { DAY_MS } from "../saas.math";
import type { InstitutionView, InvoiceView, PlanView } from "../saas.types";
import { ALERT_KINDS, NEAR_LIMIT_PCT, TRIAL_ENDING_DAYS } from "./alerts.constants";
import type { AlertKind, AlertListQuery, AlertSummary, AlertView, AttentionItem } from "./alerts.types";

/**
 * Pure port of the console's attentionItems() (src/lib/saasStats.ts): trials ending ≤ 3 days, past due,
 * near / over plan limits, failed custom domains. Ids ("<institutionId>-trial|pastdue|limit|domain") match the
 * console so read-state carries over.
 */

const LIMIT_SHORT: Record<LimitKey, string> = { students: "Students", courses: "Courses", teamMembers: "Team", storageGb: "Storage" };

/** The console's formatMoney: no cents unless the amount has them. */
export const formatMoney = (n: number) => {
  const digits = Math.round(n * 100) % 100 !== 0 ? 2 : 0;
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
};

export function trialDaysLeft(inst: InstitutionView, now = Date.now()) {
  if (inst.subscription.status !== "TRIALING" || !inst.subscription.trialEndsAt) return null;
  return Math.ceil((new Date(inst.subscription.trialEndsAt).getTime() - now) / DAY_MS);
}

export function usagePct(inst: InstitutionView, key: LimitKey, plan: PlanView | undefined) {
  const limit = plan?.limits[key];
  if (limit === null || limit === undefined) return null;
  return limit > 0 ? (inst.usage[key] / limit) * 100 : 100;
}

/** Limits at or above `threshold` %, most-used first. */
export function nearLimit(inst: InstitutionView, plan: PlanView | undefined, threshold = NEAR_LIMIT_PCT) {
  return LIMIT_KEYS.map((key) => ({ key, pct: usagePct(inst, key, plan) }))
    .filter((x): x is { key: LimitKey; pct: number } => x.pct !== null && x.pct >= threshold)
    .sort((a, b) => b.pct - a.pct);
}

export function attentionItems(store: { institutions: InstitutionView[]; plans: PlanView[]; invoices: InvoiceView[] }, now = Date.now()): AttentionItem[] {
  const items: AttentionItem[] = [];
  store.institutions.forEach((inst) => {
    const s = inst.subscription;
    const plan = store.plans.find((p) => p.id === s.planId);
    const left = trialDaysLeft(inst, now);
    if (left !== null && left <= TRIAL_ENDING_DAYS)
      items.push({
        id: `${inst.id}-trial`,
        kind: "TRIAL_ENDING",
        institution: inst,
        title: left <= 0 ? "Trial ends today" : `Trial ends in ${left} day${left === 1 ? "" : "s"}`,
        detail: s.paymentMethod ? `${plan?.name ?? ""} trial · payment method on file` : `${plan?.name ?? ""} trial · no payment method yet`,
        priority: 1 + Math.max(left, 0) / 10,
      });
    if (s.status === "PAST_DUE") {
      const open = store.invoices.filter((i) => i.institutionId === inst.id && (i.status === "FAILED" || i.status === "OPEN"));
      const total = open.reduce((sum, i) => sum + i.total, 0);
      items.push({
        id: `${inst.id}-pastdue`,
        kind: "PAST_DUE",
        institution: inst,
        title: `Past due · ${formatMoney(total)}`,
        detail: `${open.length} unpaid invoice${open.length === 1 ? "" : "s"} · ${s.paymentMethod ? `${s.paymentMethod.brand} •••• ${s.paymentMethod.last4}` : "no payment method"}`,
        priority: 0,
      });
    }
    if (s.status !== "CANCELLED" && s.status !== "SUSPENDED") {
      const near = nearLimit(inst, plan);
      if (near.length)
        items.push({
          id: `${inst.id}-limit`,
          kind: "NEAR_LIMIT",
          institution: inst,
          title: near[0]!.pct >= 100 ? "Over plan limit" : "Near plan limit",
          detail: near.map((n) => `${LIMIT_SHORT[n.key]} ${Math.round(n.pct)}%`).join(" · "),
          priority: near[0]!.pct >= 100 ? 0.5 : 2,
        });
    }
    if (inst.customDomain?.status === "FAILED")
      items.push({
        id: `${inst.id}-domain`,
        kind: "DOMAIN_FAILED",
        institution: inst,
        title: "Domain verification failed",
        detail: `${inst.customDomain.domain} · DNS not pointing to ${inst.customDomain.dnsTarget}`,
        priority: 3,
      });
  });
  return items.sort((a, b) => a.priority - b.priority);
}

// ---------------------------------------------------------------- list filters (the /alerts page)

const matches = (i: AttentionItem, q: string) =>
  !q ||
  i.institution.name.toLowerCase().includes(q) ||
  i.institution.slug.includes(q) ||
  i.title.toLowerCase().includes(q) ||
  i.detail.toLowerCase().includes(q);

/** Status + search narrow everything; `kind` narrows the rows only (tab counts come from `summary.byKind`). */
export function filterAlerts(items: AlertView[], query: Pick<AlertListQuery, "q" | "status" | "kind">): { rows: AlertView[]; searched: AlertView[] } {
  const q = (query.q ?? "").trim().toLowerCase();
  const searched = items.filter((i) => (!query.status || (query.status === "unread") === !i.read) && matches(i, q));
  return { rows: query.kind ? searched.filter((i) => i.kind === query.kind) : searched, searched };
}

export function alertSummary(all: AlertView[], searched: AlertView[]): AlertSummary {
  const byKind = Object.fromEntries(ALERT_KINDS.map((k) => [k, searched.filter((i) => i.kind === k).length])) as Record<AlertKind, number>;
  return { total: all.length, unread: all.filter((i) => !i.read).length, searched: searched.length, byKind };
}
