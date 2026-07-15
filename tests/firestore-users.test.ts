import { describe, expect, it } from "vitest";
import { normalizeRoles, roleNames } from "../src/lib/store/firestore-users";

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
