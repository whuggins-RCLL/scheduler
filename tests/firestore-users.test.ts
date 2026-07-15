import { describe, expect, it } from "vitest";
import { bootstrapRepairNeeded, normalizeRoles, roleNames } from "../src/lib/store/firestore-users";

describe("firestore user role normalization", () => {
  it("reads the Admin-SDK/seed string-list shape", () => {
    expect(normalizeRoles(["SUPER_ADMIN", "MANAGER"])).toEqual([
      { role: "SUPER_ADMIN" },
      { role: "MANAGER" },
    ]);
  });

  it("reads the in-app RoleGrant shape and preserves scope", () => {
    expect(normalizeRoles([{ role: "MANAGER", scope: { locationIds: ["loc-main"] } }])).toEqual([
      { role: "MANAGER", scope: { locationIds: ["loc-main"] } },
    ]);
  });

  it("drops unknown roles and non-array input", () => {
    expect(normalizeRoles(["SUPER_ADMIN", "NONSENSE"])).toEqual([{ role: "SUPER_ADMIN" }]);
    expect(normalizeRoles(undefined)).toEqual([]);
    expect(normalizeRoles(null)).toEqual([]);
  });

  it("flattens grants back to role names for cookies/claims", () => {
    expect(roleNames([{ role: "SUPER_ADMIN" }, { role: "MANAGER" }])).toEqual([
      "SUPER_ADMIN",
      "MANAGER",
    ]);
  });
});

describe("bootstrapRepairNeeded (break-glass self-heal)", () => {
  it("never repairs a non-bootstrap account", () => {
    expect(bootstrapRepairNeeded({ state: "pending_approval", roles: [] }, false)).toBe(false);
    expect(bootstrapRepairNeeded({ state: "active", roles: [{ role: "EMPLOYEE" }] }, false)).toBe(false);
  });

  it("leaves a correct bootstrap admin alone", () => {
    expect(
      bootstrapRepairNeeded({ state: "active", roles: [{ role: "SUPER_ADMIN" }, { role: "MANAGER" }] }, true),
    ).toBe(false);
  });

  it("repairs a bootstrap admin whose document lost its role", () => {
    expect(bootstrapRepairNeeded({ state: "active", roles: [] }, true)).toBe(true);
    expect(bootstrapRepairNeeded({ state: "active", roles: [{ role: "EMPLOYEE" }] }, true)).toBe(true);
  });

  it("repairs a bootstrap admin who is not active", () => {
    expect(
      bootstrapRepairNeeded({ state: "pending_approval", roles: [{ role: "SUPER_ADMIN" }] }, true),
    ).toBe(true);
  });
});
