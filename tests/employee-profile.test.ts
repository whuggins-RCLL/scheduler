import { describe, expect, it } from "vitest";
import type { UserAccount } from "../src/domain/types";
import {
  defaultEmployeeProfile,
  hasManagerRole,
  hasStaffRole,
} from "../src/lib/store/employee-profile";

function account(overrides: Partial<UserAccount> = {}): UserAccount {
  return {
    id: "user-1",
    email: "person@stanford.edu",
    displayName: "Person Example",
    state: "active",
    roles: [{ role: "LIBRARY_STAFF" }],
    createdAt: "2026-07-15T00:00:00.000Z",
    updatedAt: "2026-07-15T00:00:00.000Z",
    ...overrides,
  };
}

describe("employee profile defaults", () => {
  it("treats an administrator as schedulable staff without changing their admin role", () => {
    const user = account({
      email: "whuggins@law.stanford.edu",
      roles: [{ role: "SUPER_ADMIN" }, { role: "MANAGER" }],
    });
    const profile = defaultEmployeeProfile(user);

    expect(hasManagerRole(user)).toBe(true);
    expect(hasStaffRole(user)).toBe(true);
    expect(profile).toMatchObject({
      id: user.id,
      email: "whuggins@law.stanford.edu",
      active: true,
      setupComplete: true,
      classification: "manager",
      targetWeeklyHours: 40,
      maxWeeklyHours: 45,
    });
  });

  it("creates a safe zero-hour draft for an employee until onboarding is completed", () => {
    expect(defaultEmployeeProfile(account())).toMatchObject({
      active: true,
      setupComplete: false,
      classification: "other",
      targetWeeklyHours: 0,
      maxWeeklyHours: 0,
      maxDailyHours: 0,
    });
  });

  it("does not activate archived accounts or accounts without a staff role", () => {
    expect(defaultEmployeeProfile(account({ state: "archived" })).active).toBe(false);
    expect(defaultEmployeeProfile(account({ roles: [{ role: "VIEWER" }] })).active).toBe(false);
  });
});
