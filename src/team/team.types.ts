/**
 * Team API response shapes — identical to lms-admin-panel src/types/team.ts so the panel's
 * TeamSeed-based store can be swapped for `GET /team` without reshaping data.
 */
import type { RolePermissions } from "./team-permissions";

export type MemberStatus = "ACTIVE" | "INVITED" | "SUSPENDED";
export type InviteStatus = "PENDING" | "EXPIRED";

export interface TeamRoleView {
  id: string;
  name: string;
  description: string;
  tone: string;
  isSystem: boolean;
  isLocked: boolean;
  permissions: RolePermissions;
  defaultPermissions: RolePermissions | null;
  createdAt: string;
  updatedAt: string;
}

export interface MemberInviteView {
  status: InviteStatus;
  sentAt: string;
  expiresAt: string;
  message: string;
  invitedBy: string;
  resentCount: number;
}

export interface TeamMemberView {
  id: string;
  /** "" for invitations that haven't been accepted yet. */
  name: string;
  email: string;
  avatarUrl: string | null;
  roleId: string;
  extraPermissions: RolePermissions;
  status: MemberStatus;
  isOwner: boolean;
  twoFactorEnabled: boolean;
  lastActiveAt: string | null;
  lastLoginIp: string;
  /** No geo-IP lookup yet — always "". */
  location: string;
  joinedAt: string | null;
  invite: MemberInviteView | null;
}

export interface TeamEventView {
  id: string;
  type: string;
  actor: string;
  targetId: string | null;
  targetName: string;
  detail: string;
  at: string;
}

export interface TeamSnapshot {
  members: TeamMemberView[];
  roles: TeamRoleView[];
  events: TeamEventView[];
}

/** The signed-in staff member's own access (for hiding nav items / buttons). */
export interface MyTeamAccess {
  memberId: string;
  roleId: string;
  roleName: string;
  isOwner: boolean;
  permissions: RolePermissions;
}
