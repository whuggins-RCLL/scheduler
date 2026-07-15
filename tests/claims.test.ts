import { describe, expect, it } from "vitest";
import {
  desiredRoleClaims,
  normalizeRoleNames,
  reconcileClaims,
} from "../functions/src/claims";

const ORG = "rcll";

describe("normalizeRoleNames", () => {
  it("reads the string-list shape, sorts and de-dupes", () => {
    expect(normalizeRoleNames(["MANAGER", "SUPER_ADMIN", "MANAGER"])).toEqual([
      "MANAGER",
      "SUPER_ADMIN",
    ]);
  });

  it("reads the RoleGrant shape", () => {
    expect(normalizeRoleNames([{ role: "SCHEDULER" }, { role: "EMPLOYEE" }])).toEqual([
      "EMPLOYEE",
      "SCHEDULER",
    ]);
  });

  it("drops unknown roles and non-array input", () => {
    expect(normalizeRoleNames(["MANAGER", "WIZARD"])).toEqual(["MANAGER"]);
    expect(normalizeRoleNames(undefined)).toEqual([]);
    expect(normalizeRoleNames(null)).toEqual([]);
  });
});

describe("desiredRoleClaims", () => {
  it("grants roles only while active", () => {
    expect(desiredRoleClaims({ state: "active", roles: ["MANAGER"] })).toEqual(["MANAGER"]);
  });
  it("grants nothing for non-active states", () => {
    for (const state of ["pending_approval", "invited", "temporarily_inactive", "archived", "access_revoked"]) {
      expect(desiredRoleClaims({ state, roles: ["MANAGER"] })).toEqual([]);
    }
  });
});

describe("reconcileClaims", () => {
  it("grants the role claim on approval", () => {
    const r = reconcileClaims({
      existingClaims: {},
      userDoc: { state: "active", roles: ["MANAGER"] },
      orgId: ORG,
    });
    expect(r.changed).toBe(true);
    expect(r.claims).toEqual({ roles: ["MANAGER"], orgId: ORG });
  });

  it("is idempotent — no change when claims already match", () => {
    const r = reconcileClaims({
      existingClaims: { roles: ["MANAGER"], orgId: ORG },
      userDoc: { state: "active", roles: ["MANAGER"] },
      orgId: ORG,
    });
    expect(r.changed).toBe(false);
  });

  it("ignores role ordering when detecting changes (idempotent)", () => {
    const r = reconcileClaims({
      existingClaims: { roles: ["SUPER_ADMIN", "MANAGER"], orgId: ORG },
      userDoc: { state: "active", roles: ["MANAGER", "SUPER_ADMIN"] },
      orgId: ORG,
    });
    expect(r.changed).toBe(false);
  });

  it("updates the claim on demotion", () => {
    const r = reconcileClaims({
      existingClaims: { roles: ["SUPER_ADMIN", "MANAGER"], orgId: ORG },
      userDoc: { state: "active", roles: ["MANAGER"] },
      orgId: ORG,
    });
    expect(r.changed).toBe(true);
    expect(r.claims.roles).toEqual(["MANAGER"]);
  });

  it("removes the role claim on rejection (access_revoked)", () => {
    const r = reconcileClaims({
      existingClaims: { roles: ["MANAGER"], orgId: ORG },
      userDoc: { state: "access_revoked", roles: ["MANAGER"] },
      orgId: ORG,
    });
    expect(r.changed).toBe(true);
    expect(r.claims).toEqual({ orgId: ORG });
    expect("roles" in r.claims).toBe(false);
  });

  it("removes the role claim on suspension (temporarily_inactive)", () => {
    const r = reconcileClaims({
      existingClaims: { roles: ["SCHEDULER"], orgId: ORG },
      userDoc: { state: "temporarily_inactive", roles: ["SCHEDULER"] },
      orgId: ORG,
    });
    expect(r.changed).toBe(true);
    expect("roles" in r.claims).toBe(false);
  });

  it("removes the role claim on document deletion", () => {
    const r = reconcileClaims({
      existingClaims: { roles: ["MANAGER"], orgId: ORG, custom: "keep" },
      userDoc: undefined,
      orgId: ORG,
    });
    expect(r.changed).toBe(true);
    expect(r.claims).toEqual({ orgId: ORG, custom: "keep" });
  });

  it("preserves unrelated existing claims", () => {
    const r = reconcileClaims({
      existingClaims: { provider: "google", tier: "gold" },
      userDoc: { state: "active", roles: ["EMPLOYEE"] },
      orgId: ORG,
    });
    expect(r.claims).toEqual({
      provider: "google",
      tier: "gold",
      roles: ["EMPLOYEE"],
      orgId: ORG,
    });
  });

  it("tags orgId without clobbering an unrelated claim, and never strips it on delete", () => {
    const added = reconcileClaims({
      existingClaims: { roles: ["MANAGER"] },
      userDoc: { state: "active", roles: ["MANAGER"] },
      orgId: ORG,
    });
    expect(added.changed).toBe(true);
    expect(added.claims.orgId).toBe(ORG);

    const deleted = reconcileClaims({
      existingClaims: { roles: ["MANAGER"], orgId: ORG },
      userDoc: undefined,
      orgId: ORG,
    });
    expect(deleted.claims.orgId).toBe(ORG);
  });

  it("adds only the tenant tag for a pending account (no role claim granted)", () => {
    const r = reconcileClaims({
      existingClaims: {},
      userDoc: { state: "pending_approval", roles: [] },
      orgId: ORG,
    });
    // Only orgId is added; roles stays absent.
    expect(r.claims).toEqual({ orgId: ORG });
    expect(r.changed).toBe(true);
  });
});
