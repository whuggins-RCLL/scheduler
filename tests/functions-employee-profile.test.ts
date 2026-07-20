import { describe, expect, it } from "vitest";
import {
  defaultEmployeeProfileData,
  roleNames,
  shouldHaveEmployeeProfile,
} from "../functions/src/employee-profile";

describe("employee-profile provisioning trigger", () => {
  it("accepts both string and structured role storage", () => {
    expect(roleNames(["LIBRARY_STAFF", { role: "MANAGER" }, null])).toEqual(["LIBRARY_STAFF", "MANAGER"]);
  });

  it("maps the legacy EMPLOYEE role name to LIBRARY_STAFF", () => {
    expect(roleNames(["EMPLOYEE", { role: "EMPLOYEE" }])).toEqual(["LIBRARY_STAFF", "LIBRARY_STAFF"]);
  });

  it("provisions active library staff and administrators, but not archived or viewer accounts", () => {
    expect(shouldHaveEmployeeProfile({ state: "active", roles: ["LIBRARY_STAFF"] })).toBe(true);
    // Legacy role name still provisions (backward compatible).
    expect(shouldHaveEmployeeProfile({ state: "active", roles: ["EMPLOYEE"] })).toBe(true);
    expect(shouldHaveEmployeeProfile({ state: "active", roles: ["SUPER_ADMIN"] })).toBe(true);
    expect(shouldHaveEmployeeProfile({ state: "archived", roles: ["LIBRARY_STAFF"] })).toBe(false);
    expect(shouldHaveEmployeeProfile({ state: "active", roles: ["VIEWER"] })).toBe(false);
  });

  it("gives managers complete defaults and regular employees a zero-hour draft", () => {
    expect(defaultEmployeeProfileData("manager-1", {
      email: "manager@stanford.edu",
      displayName: "Manager",
      roles: ["SUPER_ADMIN"],
    })).toMatchObject({
      active: true,
      setupComplete: true,
      classification: "manager",
      targetWeeklyHours: 40,
    });
    expect(defaultEmployeeProfileData("employee-1", {
      email: "employee@stanford.edu",
      displayName: "Employee",
      roles: ["LIBRARY_STAFF"],
    })).toMatchObject({
      active: true,
      setupComplete: false,
      classification: "other",
      targetWeeklyHours: 0,
    });
  });
});
