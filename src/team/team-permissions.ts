/**
 * Team permission model — a backend copy of lms-admin-panel src/lib/teamPermissions.ts
 * (keep both in sync). Pure functions only: normalising, merging, diffing and validating permission maps.
 */

export const TEAM_MODULES = [
  "dashboard",
  "analytics",
  "courses",
  "categories",
  "students",
  "instructors",
  "orders",
  "payments",
  "liveClasses",
  "assignments",
  "quizzes",
  "community",
  "certificates",
  "notifications",
  "settings",
  "team",
] as const;
export type TeamModule = (typeof TEAM_MODULES)[number];

/** "manage" = Create & edit. Export / Refund / Moderate only exist on some modules. */
export const PERMISSION_ACTIONS = ["view", "manage", "delete", "export", "refund", "moderate"] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

/** Granted actions per module (every module key present; [] = no access). */
export type RolePermissions = Record<TeamModule, PermissionAction[]>;

export const MODULE_LABEL: Record<TeamModule, string> = {
  dashboard: "Dashboard",
  analytics: "Analytics",
  courses: "Courses",
  categories: "Categories",
  students: "Students",
  instructors: "Instructors",
  orders: "Orders",
  payments: "Payments",
  liveClasses: "Live Classes",
  assignments: "Assignments",
  quizzes: "Quizzes",
  community: "Community",
  certificates: "Certificates",
  notifications: "Notifications",
  settings: "Settings",
  team: "Team",
};

export const ACTION_LABEL: Record<PermissionAction, string> = {
  view: "View",
  manage: "Create & edit",
  delete: "Delete",
  export: "Export",
  refund: "Refund",
  moderate: "Moderate",
};

/** Actions that exist for each module. */
export const MODULE_ACTIONS: Record<TeamModule, PermissionAction[]> = {
  dashboard: ["view"],
  analytics: ["view", "export"],
  courses: ["view", "manage", "delete"],
  categories: ["view", "manage", "delete"],
  students: ["view", "manage", "delete"],
  instructors: ["view", "manage", "delete"],
  orders: ["view", "manage", "delete", "export"],
  payments: ["view", "manage", "export", "refund"],
  liveClasses: ["view", "manage", "delete"],
  assignments: ["view", "manage", "delete"],
  quizzes: ["view", "manage", "delete"],
  community: ["view", "manage", "delete", "moderate"],
  certificates: ["view", "manage", "delete"],
  notifications: ["view", "manage", "delete"],
  settings: ["view", "manage"],
  team: ["view", "manage", "delete"],
};

export const isApplicable = (module: TeamModule, action: PermissionAction) => MODULE_ACTIONS[module].includes(action);

const build = (row: (m: TeamModule) => PermissionAction[]) => Object.fromEntries(TEAM_MODULES.map((m) => [m, row(m)])) as unknown as RolePermissions;

export const emptyPermissions = (): RolePermissions => build(() => []);
export const fullPermissions = (): RolePermissions => build((m) => [...MODULE_ACTIONS[m]]);

/** Applicable actions only, canonical order, and "view" whenever another action is on. */
export function normalizeRow(module: TeamModule, actions: PermissionAction[]): PermissionAction[] {
  const set = new Set(actions.filter((a) => isApplicable(module, a)));
  if (set.size > 0) set.add("view");
  return PERMISSION_ACTIONS.filter((a) => set.has(a));
}

export const normalizePermissions = (p: Partial<RolePermissions> | null | undefined): RolePermissions => build((m) => normalizeRow(m, p?.[m] ?? []));

export const TOTAL_PERMISSIONS = TEAM_MODULES.reduce((n, m) => n + MODULE_ACTIONS[m].length, 0);
export const countPermissions = (p: RolePermissions) => TEAM_MODULES.reduce((n, m) => n + p[m].length, 0);
export const modulesWithAccess = (p: RolePermissions) => TEAM_MODULES.filter((m) => p[m].length > 0);

export const samePermissions = (a: RolePermissions, b: RolePermissions) =>
  TEAM_MODULES.every((m) => a[m].length === b[m].length && a[m].every((x) => b[m].includes(x)));

/** Union (canonical order, View added wherever another action is on). */
export const mergePermissions = (a: RolePermissions, b: Partial<RolePermissions>): RolePermissions => build((m) => normalizeRow(m, [...a[m], ...(b[m] ?? [])]));

/** Actions in `a` that are not in `b`. */
export const subtractPermissions = (a: RolePermissions, b: RolePermissions): RolePermissions => build((m) => a[m].filter((x) => !b[m].includes(x)));

/**
 * Extras relative to a role: only applicable actions the role doesn't already give, plus "view"
 * when the role has no View on that module (so role ∪ extras always obeys the View rule).
 */
export function normalizeExtras(extras: Partial<RolePermissions> | null | undefined, base: RolePermissions): RolePermissions {
  return build((m) => {
    const set = new Set((extras?.[m] ?? []).filter((a) => isApplicable(m, a) && !base[m].includes(a)));
    if (set.size > 0 && !base[m].includes("view")) set.add("view");
    return PERMISSION_ACTIONS.filter((a) => set.has(a));
  });
}

/** What a member can do: role ∪ extras (owner / locked role → everything). */
export function effectivePermissions(member: { isOwner: boolean; extraPermissions: RolePermissions }, role: { permissions: RolePermissions; isLocked: boolean }): RolePermissions {
  if (member.isOwner || role.isLocked) return fullPermissions();
  return mergePermissions(role.permissions, member.extraPermissions);
}

export const isRoleModified = (r: { permissions: RolePermissions; defaultPermissions: RolePermissions | null; isLocked: boolean }) =>
  !r.isLocked && !!r.defaultPermissions && !samePermissions(r.permissions, r.defaultPermissions);

/** "Analytics → Export, Students → View +1" (first `max` grants). */
export function listGrants(p: RolePermissions, max = 2): string {
  const items = TEAM_MODULES.flatMap((m) => p[m].map((a) => `${MODULE_LABEL[m]} → ${ACTION_LABEL[a]}`));
  return `${items.slice(0, max).join(", ")}${items.length > max ? ` +${items.length - max}` : ""}`;
}

/** "Added Courses → Delete, removed Settings → View" (first few changes). */
export function diffPermissions(before: RolePermissions, after: RolePermissions): string {
  const added: string[] = [];
  const removed: string[] = [];
  TEAM_MODULES.forEach((m) => {
    after[m].filter((a) => !before[m].includes(a)).forEach((a) => added.push(`${MODULE_LABEL[m]} → ${ACTION_LABEL[a]}`));
    before[m].filter((a) => !after[m].includes(a)).forEach((a) => removed.push(`${MODULE_LABEL[m]} → ${ACTION_LABEL[a]}`));
  });
  const fmt = (verb: string, xs: string[]) => (xs.length ? `${verb} ${xs.slice(0, 2).join(", ")}${xs.length > 2 ? ` +${xs.length - 2}` : ""}` : "");
  const out = [fmt("Added", added), fmt("removed", removed)].filter(Boolean).join(", ");
  return out.charAt(0).toUpperCase() + out.slice(1);
}

// ---------------------------------------------------------------- validation

/**
 * First problem with a permission map, or null when valid.
 * `requireView`: roles need View whenever another action in the row is on; member extras don't (View can come from the role).
 */
export function permissionsError(value: unknown, requireView: boolean): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return "Permissions must be an object of module → actions";
  const p = value as Record<string, unknown>;
  const unknownModule = Object.keys(p).find((k) => !(TEAM_MODULES as readonly string[]).includes(k));
  if (unknownModule) return `Unknown module "${unknownModule}"`;
  for (const m of TEAM_MODULES) {
    const row = p[m];
    if (row === undefined) return `Missing permissions for ${MODULE_LABEL[m]}`;
    if (!Array.isArray(row) || row.some((a) => typeof a !== "string")) return `${MODULE_LABEL[m]} permissions must be a list of actions`;
    const bad = (row as string[]).find((a) => !isApplicable(m, a as PermissionAction));
    if (bad) return (PERMISSION_ACTIONS as readonly string[]).includes(bad) ? `${ACTION_LABEL[bad as PermissionAction]} doesn't apply to ${MODULE_LABEL[m]}` : `Unknown action "${bad}"`;
    if (new Set(row).size !== row.length) return `Duplicate actions on ${MODULE_LABEL[m]}`;
    if (requireView && row.length > 0 && !row.includes("view")) return `${MODULE_LABEL[m]} needs View when other actions are on`;
  }
  return null;
}

// ---------------------------------------------------------------- built-in roles

type Grants = Partial<Record<TeamModule, PermissionAction[]>>;
const CRUD: PermissionAction[] = ["view", "manage", "delete"];

const ADMIN_PRESET = (): RolePermissions => ({ ...fullPermissions(), team: ["view"], settings: ["view"] });
const CONTENT_PRESET: Grants = {
  dashboard: ["view"],
  analytics: ["view"],
  courses: CRUD,
  categories: CRUD,
  instructors: ["view"],
  liveClasses: CRUD,
  assignments: CRUD,
  quizzes: CRUD,
  community: ["view", "manage", "moderate"],
  certificates: ["view", "manage"],
  notifications: ["view", "manage"],
};
const SUPPORT_PRESET: Grants = {
  dashboard: ["view"],
  students: ["view", "manage"],
  instructors: ["view"],
  orders: ["view"],
  payments: ["view"],
  liveClasses: ["view"],
  community: ["view", "manage", "moderate"],
  certificates: ["view", "manage"],
  notifications: ["view", "manage"],
};
const FINANCE_PRESET: Grants = {
  dashboard: ["view"],
  analytics: ["view", "export"],
  students: ["view"],
  orders: ["view", "manage", "export"],
  payments: ["view", "manage", "export", "refund"],
};

export const SUPER_ADMIN_KEY = "super-admin";

/** Built-in roles seeded for every workspace (same names / presets as the panel's mock data). */
export const SYSTEM_ROLES: { key: string; name: string; description: string; tone: string; locked: boolean; permissions: () => RolePermissions }[] = [
  { key: SUPER_ADMIN_KEY, name: "Super Admin", description: "Full, unrestricted access to everything, including billing, settings and the team.", tone: "orange", locked: true, permissions: fullPermissions },
  { key: "admin", name: "Admin", description: "Runs day-to-day operations across every area. Can't manage the team or change platform settings.", tone: "blue", locked: false, permissions: ADMIN_PRESET },
  { key: "content", name: "Content Manager", description: "Builds and maintains courses, lessons, quizzes and assignments, and moderates discussions.", tone: "purple", locked: false, permissions: () => normalizePermissions(CONTENT_PRESET) },
  { key: "support", name: "Support", description: "Helps learners: student accounts, orders lookup, community replies and certificates.", tone: "green", locked: false, permissions: () => normalizePermissions(SUPPORT_PRESET) },
  { key: "finance", name: "Finance", description: "Handles orders, payments, refunds and revenue exports.", tone: "yellow", locked: false, permissions: () => normalizePermissions(FINANCE_PRESET) },
];
