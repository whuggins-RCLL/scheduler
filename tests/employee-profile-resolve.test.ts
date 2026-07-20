import { describe, expect, it } from "vitest";
import { inferClassificationForUser, resolveEmployeeProfile } from "../src/domain/employee-profile";
import { canSubmitAvailabilityException, isStudentWorker } from "../src/domain/scope";
import type { EmployeeProfile, UserAccount } from "../src/domain/types";

function user(overrides: Partial<UserAccount> = {}): UserAccount {
  return {
    id: "user-1",
    email: "test@example.com",
    displayName: "Test User",
    state: "active",
    roles: [{ role: "LIBRARY_STAFF" }],
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

describe("resolveEmployeeProfile", () => {
  const stored: EmployeeProfile = {
    id: "user-1",
    legalName: "Stored Name",
    email: "test@example.com",
    classification: "non_exempt_staff",
    eligibleLocationIds: [],
    additionalManagerIds: [],
    active: true,
    targetWeeklyHours: 20,
    minWeeklyHours: 0,
    maxWeeklyHours: 40,
    maxDailyHours: 8,
    earliestStart: 480,
    latestEnd: 1200,
    minTurnaroundMinutes: 480,
    overtimeEligible: true,
    breakPolicyId: "ca-nonexempt-v1",
    qualifiedPositionIds: [],
    qualifiedTaskIds: [],
    employmentPercentage: 1,
    googleCalendarConnected: false,
    notificationPrefs: { inApp: true, email: true, calendar: false, digest: false },
  };

  it("returns the stored profile when one exists", () => {
    expect(resolveEmployeeProfile([stored], user())).toBe(stored);
  });

  it("synthesizes a student profile for view-as personas", () => {
    const profile = resolveEmployeeProfile([], user({ id: "view-student", displayName: "Sample student" }), "student");
    expect(profile.classification).toBe("student_worker");
    expect(profile.preferredName).toBe("Sample student");
  });

  it("infers classification from view-as mode", () => {
    expect(inferClassificationForUser({ id: "some-id" }, "staff")).toBe("non_exempt_staff");
  });

  it("defaults a real self-viewing account with no stored profile to staff, not student", () => {
    // A signed-in staff member without an employeeProfiles document must not be
    // treated as a student, or they get locked out of adding their own exceptions.
    expect(inferClassificationForUser({ id: "user-42" })).toBe("non_exempt_staff");
    expect(inferClassificationForUser({ id: "user-42" }, "self")).toBe("non_exempt_staff");

    const profile = resolveEmployeeProfile([], user({ id: "user-42" }));
    expect(isStudentWorker(profile.classification)).toBe(false);
  });

  it("lets a profile-less staff member add their own availability exception", () => {
    const account = user({ id: "user-42" });
    const profile = resolveEmployeeProfile([], account);
    expect(canSubmitAvailabilityException(account, profile)).toBe(true);
  });
});
