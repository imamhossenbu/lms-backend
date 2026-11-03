import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import type { InstitutionView, InvoiceView, PlanView } from "../saas.types";
import { alertSummary, attentionItems, filterAlerts, formatMoney } from "./alerts.rules";
import type { AlertView } from "./alerts.types";
import { AlertIdsDto } from "./dto/alerts.dto";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 3, 12);
const ID = "11111111-2222-3333-4444-555555555555";

const plan: PlanView = {
  id: "starter",
  name: "Starter",
  tagline: "",
  priceMonthly: 29,
  priceYearly: 290,
  limits: { students: 200, courses: 20, teamMembers: 3, storageGb: 10 },
  features: [],
  highlighted: false,
  isPublic: true,
  trialDays: 14,
  archived: false,
  updatedAt: new Date(NOW).toISOString(),
};

function inst(id: string, sub: Partial<InstitutionView["subscription"]> = {}, extra: Partial<InstitutionView> = {}): InstitutionView {
  return {
    id,
    name: `Inst ${id.slice(0, 4)}`,
    slug: `inst-${id.slice(0, 4)}`,
    logoInitials: "IN",
    tone: "orange",
    type: "SCHOOL",
    country: "Bangladesh",
    ownerName: "O",
    ownerEmail: "o@x.co",
    phone: "",
    createdAt: new Date(NOW).toISOString(),
    lastActiveAt: new Date(NOW).toISOString(),
    subscription: {
      planId: "starter",
      cycle: "MONTHLY",
      status: "ACTIVE",
      startedAt: new Date(NOW).toISOString(),
      trialEndsAt: null,
      currentPeriodStart: new Date(NOW).toISOString(),
      currentPeriodEnd: new Date(NOW + 30 * DAY).toISOString(),
      cancelAtPeriodEnd: false,
      cancelledAt: null,
      suspendedAt: null,
      suspendedReason: null,
      statusBeforeSuspend: null,
      customPrice: null,
      paymentMethod: null,
      ...sub,
    },
    customDomain: null,
    usage: { students: 10, courses: 1, teamMembers: 1, storageGb: 1 },
    notes: "",
    source: "SELF_SIGNUP",
    ...extra,
  };
}

const invoice = (institutionId: string, total: number, status: InvoiceView["status"]): InvoiceView => ({
  id: `inv-${total}`,
  number: "EDP-2026-00001",
  institutionId,
  planId: "starter",
  cycle: "MONTHLY",
  amount: total,
  tax: 0,
  total,
  status,
  issuedAt: new Date(NOW).toISOString(),
  dueAt: new Date(NOW).toISOString(),
  paidAt: null,
  periodStart: new Date(NOW).toISOString(),
  periodEnd: new Date(NOW).toISOString(),
  discount: 0,
  couponCode: null,
});

describe("attentionItems (port of the console)", () => {
  const a = "aaaaaaaa-0000-0000-0000-000000000000";
  const b = "bbbbbbbb-0000-0000-0000-000000000000";
  const c = "cccccccc-0000-0000-0000-000000000000";
  const items = attentionItems(
    {
      plans: [plan],
      institutions: [
        inst(a, { status: "TRIALING", trialEndsAt: new Date(NOW + 2 * DAY).toISOString() }),
        inst(b, { status: "PAST_DUE", paymentMethod: { brand: "Visa", last4: "4242" } }, { usage: { students: 200, courses: 19, teamMembers: 1, storageGb: 1 } }),
        inst(c, {}, { customDomain: { domain: "learn.x.com", status: "FAILED", addedAt: "", verifiedAt: null, dnsTarget: "cname.edupro.com", txtToken: "", lastCheckedAt: null } }),
      ],
      invoices: [invoice(b, 30.45, "FAILED"), invoice(b, 29, "OPEN"), invoice(b, 99, "PAID")],
    },
    NOW,
  );

  it("raises every kind with console ids, titles and priority order", () => {
    expect(items.map((i) => i.id)).toEqual([`${b}-pastdue`, `${b}-limit`, `${a}-trial`, `${c}-domain`]);
    expect(items[0]!.title).toBe("Past due · $59.45");
    expect(items[0]!.detail).toBe("2 unpaid invoices · Visa •••• 4242");
    expect(items[1]!.title).toBe("Over plan limit");
    expect(items[1]!.detail).toBe("Students 100% · Courses 95%");
    expect(items[2]!.title).toBe("Trial ends in 2 days");
    expect(items[3]!.detail).toBe("learn.x.com · DNS not pointing to cname.edupro.com");
  });

  it("filters by status / search / kind and summarises tab counts", () => {
    const views: AlertView[] = items.map((i, n) => ({ ...i, read: n === 0, readAt: null }));
    const { rows, searched } = filterAlerts(views, { status: "unread", kind: "NEAR_LIMIT" });
    expect(rows.map((r) => r.kind)).toEqual(["NEAR_LIMIT"]);
    expect(searched).toHaveLength(3);
    expect(alertSummary(views, searched)).toEqual({ total: 4, unread: 3, searched: 3, byKind: { PAST_DUE: 0, TRIAL_ENDING: 1, NEAR_LIMIT: 1, DOMAIN_FAILED: 1 } });
    expect(filterAlerts(views, { q: "learn.x" }).rows).toHaveLength(1);
  });

  it("formats money like the console", () => {
    expect(formatMoney(59)).toBe("$59");
    expect(formatMoney(1234.5)).toBe("$1,234.50");
  });
});

describe("AlertIdsDto", () => {
  it("accepts console alert ids only", () => {
    expect(validateSync(plainToInstance(AlertIdsDto, { ids: [`${ID}-pastdue`, `${ID}-trial`] }))).toHaveLength(0);
    const errs = validateSync(plainToInstance(AlertIdsDto, { ids: ["nope"] })).flatMap((e) => Object.values(e.constraints ?? {}));
    expect(errs).toContain("Unknown alert id");
    const empty = validateSync(plainToInstance(AlertIdsDto, { ids: [] })).flatMap((e) => Object.values(e.constraints ?? {}));
    expect(empty).toContain("Choose at least one alert");
  });
});
