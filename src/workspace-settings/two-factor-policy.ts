/**
 * Settings › Security › "Require two-factor for admins". Pure decision used by TeamAccessService (every
 * @RequirePermission endpoint) and by login (`twoFactorSetupRequired` flag).
 */
export interface TwoFactorPolicyInput {
  /** Workspace setting security.requireAdmin2fa. */
  requireAdmin2fa: boolean;
  /** JWT role. Only admin-panel staff ("ADMIN") are subject to the rule. */
  role: string;
  twoFactorEnabled: boolean;
  /**
   * Workspace owner — never locked out, so someone can always reach Settings › Security. Members of the
   * Super Admin role are NOT exempt (they can still open the 2FA setup endpoints). The platform owner
   * (JWT role SUPER_ADMIN) isn't staff, so the role check already exempts them.
   */
  isOwner: boolean;
  /** Owner Console impersonation token — the platform owner acts on the workspace's behalf. */
  impersonatedBy?: string | null;
}

export function mustSetUpTwoFactor(p: TwoFactorPolicyInput): boolean {
  if (!p.requireAdmin2fa || p.role !== "ADMIN") return false;
  if (p.impersonatedBy || p.isOwner) return false;
  return !p.twoFactorEnabled;
}
