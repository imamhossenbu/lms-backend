/**
 * SaaS constants — kept in sync with the frontend contract
 * (lms-admin-panel / lms-owner-console: src/types/saas.ts + src/validations/saasSchema.ts).
 */

/** Role of the platform owner (Owner Console). Institution admins use "ADMIN". */
export const PLATFORM_OWNER_ROLE = "SUPER_ADMIN";
export const INSTITUTION_ADMIN_ROLE = "ADMIN";

export const SAAS_ROOT_DOMAIN = "edupro.com";
export const SAAS_CNAME_TARGET = "cname.edupro.com";
export const SAAS_TRIAL_DAYS = 14;

export const TIER_PLAN_IDS = ["starter", "growth", "pro", "enterprise"] as const;

export const FEATURE_KEYS = [
  "liveClasses",
  "certificates",
  "community",
  "aiAssistant",
  "advancedAnalytics",
  "customDomain",
  "whiteLabel",
  "apiAccess",
  "prioritySupport",
] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

export const LIMIT_KEYS = ["students", "courses", "teamMembers", "storageGb"] as const;
export type LimitKey = (typeof LIMIT_KEYS)[number];

export const LIMIT_LABEL: Record<LimitKey, string> = {
  students: "Students",
  courses: "Courses",
  teamMembers: "Team members",
  storageGb: "Storage",
};

export const PAYMENT_BRANDS = ["Visa", "Mastercard", "bKash", "SSLCommerz"] as const;
export type PaymentBrand = (typeof PAYMENT_BRANDS)[number];

export const SAAS_COUNTRIES = [
  "Bangladesh",
  "India",
  "Pakistan",
  "Nepal",
  "Sri Lanka",
  "United Arab Emirates",
  "Saudi Arabia",
  "Malaysia",
  "Singapore",
  "United Kingdom",
  "United States",
  "Canada",
  "Australia",
  "Germany",
  "Nigeria",
  "Kenya",
] as const;

export const SAAS_TAX_RATES: Record<string, number> = {
  Bangladesh: 0.05,
  "United Kingdom": 0.2,
  Germany: 0.19,
  India: 0.18,
};

export const TONES = ["orange", "blue", "green", "purple", "yellow", "indigo"] as const;

export const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/;
export const RESERVED_SLUGS = ["www", "console", "app", "api", "admin", "mail", "support", "help", "status"];
export const HOSTNAME_REGEX = /^(?=.{4,253}$)(?!-)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
export const PHONE_REGEX = /^\+?[0-9 ()-]{7,20}$/;

export const NAME_MAX = 80;
export const NOTES_MAX = 1000;
export const TAGLINE_MAX = 120;
export const MAX_EVENTS_IN_SNAPSHOT = 2000;

export const isReservedSlug = (slug: string) => RESERVED_SLUGS.includes(slug.trim().toLowerCase());

/** "Dhaka Coding Academy!" → "dhaka-coding-academy" (max 32 chars, no edge hyphens). */
export function normalizeSlug(input: string) {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 32)
    .replace(/^-+|-+$/g, "");
}

const PLAN_FEATURES: Record<(typeof TIER_PLAN_IDS)[number], FeatureKey[]> = {
  starter: ["certificates", "community"],
  growth: ["certificates", "community", "liveClasses", "aiAssistant", "advancedAnalytics"],
  pro: ["certificates", "community", "liveClasses", "aiAssistant", "advancedAnalytics", "customDomain", "whiteLabel", "apiAccess"],
  enterprise: [...FEATURE_KEYS],
};

/** The four built-in tiers, seeded when the plans table is empty. */
export const DEFAULT_PLANS = [
  {
    id: "starter",
    name: "Starter",
    tagline: "For tutors and small coaching centres getting started online.",
    priceMonthly: 29,
    priceYearly: 290,
    limitStudents: 200,
    limitCourses: 20,
    limitTeamMembers: 3,
    limitStorageGb: 10,
    features: PLAN_FEATURES.starter,
    highlighted: false,
    isPublic: true,
    trialDays: SAAS_TRIAL_DAYS,
  },
  {
    id: "growth",
    name: "Growth",
    tagline: "Live classes, AI assistant and analytics for growing schools.",
    priceMonthly: 79,
    priceYearly: 790,
    limitStudents: 1000,
    limitCourses: 100,
    limitTeamMembers: 10,
    limitStorageGb: 50,
    features: PLAN_FEATURES.growth,
    highlighted: true,
    isPublic: true,
    trialDays: SAAS_TRIAL_DAYS,
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "Your own domain, white-label branding and API access.",
    priceMonthly: 199,
    priceYearly: 1990,
    limitStudents: 5000,
    limitCourses: null,
    limitTeamMembers: 25,
    limitStorageGb: 200,
    features: PLAN_FEATURES.pro,
    highlighted: false,
    isPublic: true,
    trialDays: SAAS_TRIAL_DAYS,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    tagline: "Unlimited everything, priority support and a negotiated contract.",
    priceMonthly: 0,
    priceYearly: 0,
    limitStudents: null,
    limitCourses: null,
    limitTeamMembers: null,
    limitStorageGb: null,
    features: PLAN_FEATURES.enterprise,
    highlighted: false,
    isPublic: false,
    trialDays: 30,
  },
];
