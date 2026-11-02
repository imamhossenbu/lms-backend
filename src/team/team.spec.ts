import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { decryptSecret, encryptSecret, sha256 } from "../common/crypto";
import { InviteMembersDto, RoleDto } from "./dto/team.dto";
import {
  countPermissions,
  diffPermissions,
  effectivePermissions,
  emptyPermissions,
  fullPermissions,
  normalizeExtras,
  normalizePermissions,
  permissionsError,
  SYSTEM_ROLES,
  TOTAL_PERMISSIONS,
} from "./team-permissions";
import { assertCanGrant, assertCanTouch, assertNotSelf } from "./team.rules";

const messages = (cls: any, body: object) => validateSync(plainToInstance(cls, body), { whitelist: true }).flatMap((e) => Object.values(e.constraints ?? {}));

describe("team permissions", () => {
  it("adds View whenever another action is on and drops inapplicable actions", () => {
    const p = normalizePermissions({ courses: ["delete"], dashboard: ["view", "export" as any] });
    expect(p.courses).toEqual(["view", "delete"]);
    expect(p.dashboard).toEqual(["view"]);
    expect(p.settings).toEqual([]);
  });

  it("keeps extras disjoint from the role", () => {
    const role = normalizePermissions({ students: ["view"] });
    const extras = normalizeExtras({ students: ["view", "manage"], analytics: ["export"] }, role);
    expect(extras.students).toEqual(["manage"]); // view comes from the role
    expect(extras.analytics).toEqual(["view", "export"]); // role has no view there → added
  });

  it("owner / locked role get everything", () => {
    expect(countPermissions(effectivePermissions({ isOwner: true, extraPermissions: emptyPermissions() }, { permissions: emptyPermissions(), isLocked: false }))).toBe(TOTAL_PERMISSIONS);
    const merged = effectivePermissions({ isOwner: false, extraPermissions: normalizePermissions({ orders: ["export"] }) }, { permissions: normalizePermissions({ orders: ["view"] }), isLocked: false });
    expect(merged.orders).toEqual(["view", "export"]);
  });

  it("validates permission maps like the panel's zod schema", () => {
    expect(permissionsError(fullPermissions(), true)).toBeNull();
    expect(permissionsError({ ...emptyPermissions(), courses: ["manage"] }, true)).toBe("Courses needs View when other actions are on");
    expect(permissionsError({ ...emptyPermissions(), courses: ["manage"] }, false)).toBeNull();
    expect(permissionsError({ ...emptyPermissions(), dashboard: ["refund"] }, true)).toBe("Refund doesn't apply to Dashboard");
    const { team: _omit, ...missing } = emptyPermissions();
    expect(permissionsError(missing, true)).toBe("Missing permissions for Team");
    expect(permissionsError({ ...emptyPermissions(), hacking: [] }, true)).toBe('Unknown module "hacking"');
  });

  it("describes changes", () => {
    const a = normalizePermissions({ courses: ["view"] });
    const b = normalizePermissions({ courses: ["view", "delete"], settings: [] });
    expect(diffPermissions(a, b)).toBe("Added Courses → Delete");
  });

  it("ships the five built-in roles with Super Admin locked", () => {
    expect(SYSTEM_ROLES.map((r) => r.name)).toEqual(["Super Admin", "Admin", "Content Manager", "Support", "Finance"]);
    expect(SYSTEM_ROLES.filter((r) => r.locked).map((r) => r.key)).toEqual(["super-admin"]);
    expect(SYSTEM_ROLES.find((r) => r.key === "admin")!.permissions().team).toEqual(["view"]);
  });
});

describe("team rules (privilege escalation)", () => {
  const support = { permissions: normalizePermissions({ students: ["view", "manage"], team: ["view", "manage"] }) };

  it("can't grant what you don't have", () => {
    expect(() => assertCanGrant(support, normalizePermissions({ students: ["view"] }))).not.toThrow();
    expect(() => assertCanGrant(support, normalizePermissions({ payments: ["refund"] }))).toThrow("missing Payments → View");
  });

  it("can't change your own access or touch a Super Admin unless you are one", () => {
    expect(() => assertNotSelf({ userId: "u1" }, { userId: "u1" })).toThrow("You can't change your own access");
    expect(() => assertNotSelf({ userId: "u1" }, { userId: null })).not.toThrow();
    expect(() => assertCanTouch({ isSuperAdmin: false }, { isOwner: false, role: { isLocked: true } })).toThrow("Only a Super Admin");
    expect(() => assertCanTouch({ isSuperAdmin: true }, { isOwner: false, role: { isLocked: true } })).not.toThrow();
  });
});

describe("team DTOs", () => {
  it("validates roles", () => {
    expect(messages(RoleDto, { name: "Marketing", description: "", tone: "red", permissions: fullPermissions() })).toHaveLength(0);
    expect(messages(RoleDto, { name: "<script>", tone: "pink", permissions: { ...emptyPermissions(), courses: ["manage"] } })).toEqual(
      expect.arrayContaining(["Use letters, numbers, spaces and & ' ( ) - / . only", "Choose a colour", "Courses needs View when other actions are on"]),
    );
  });

  it("normalises and validates invite emails", () => {
    const dto = plainToInstance(InviteMembersDto, { emails: [" Rafiq@Example.com "], roleId: "3f2a9c1e-1111-4222-8333-444455556666" });
    expect(validateSync(dto)).toHaveLength(0);
    expect(dto.emails).toEqual(["rafiq@example.com"]);
    expect(messages(InviteMembersDto, { emails: ["nope"], roleId: "x" })).toEqual(expect.arrayContaining(["Each entry must be a valid email address", "Choose a role"]));
  });
});

describe("crypto", () => {
  it("encrypts secrets reversibly with authentication", () => {
    process.env.SUPER_SECRET_KEY ??= "test-secret";
    const enc = encryptSecret("JBSWY3DPEHPK3PXP");
    expect(enc).not.toContain("JBSWY3DPEHPK3PXP");
    expect(decryptSecret(enc)).toBe("JBSWY3DPEHPK3PXP");
    const tampered = enc.slice(0, -2) + (enc.endsWith("A") ? "BB" : "AA");
    expect(() => decryptSecret(tampered)).toThrow();
    expect(sha256("x")).toHaveLength(64);
  });
});
