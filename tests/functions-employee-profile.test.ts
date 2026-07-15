import { describe, expect, it } from "vitest";
import {
  defaultEmployeeProfileData,
  roleNames,
  shouldHaveEmployeeProfile,
} from "../functions/src/employee-profile";

describe("employee-profile provisioning trigger", () => {
  it("accepts both string and structured role storage", () => {
    expect(roleNames(["EMPLOYEE", { role: "MANAGER" }, null])).toEqual(["EMPLOYEE", "MANAGER"]);
  });

  it("provisions active employees and administrators, but not archived or viewer accounts", () => {
    expect(shouldHaveEmployeeProfile({ state: "active", roles: ["EMPLOYEE"] })).toBe(true);
    expect(shouldHaveEmployeeProfile({ state: "active", roles: ["SUPER_ADMIN"] })).toBe(true);
    expect(shouldHaveEmployeeProfile({ state: "archived", roles: ["EMPLOYEE"] })).toBe(false);
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
      roles: ["EMPLOYEE"],
    })).toMatchObject({
      active: true,
      setupComplete: false,
      classification: "other",
      targetWeeklyHours: 0,
    });
  });
});
