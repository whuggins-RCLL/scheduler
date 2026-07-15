import { describe, expect, it } from "vitest";
import { mapAvailabilityPattern, mapEmployeeProfile } from "../src/lib/store/firestore-workforce";

describe("Firestore workforce mapping", () => {
  it("maps a complete employee profile", () => {
    expect(mapEmployeeProfile("employee-1", {
      legalName: "Employee One",
      email: "EMPLOYEE@STANFORD.EDU",
      classification: "student_worker",
      active: true,
      setupComplete: true,
      targetWeeklyHours: 20,
      maxWeeklyHours: 25,
      maxDailyHours: 8,
      eligibleLocationIds: ["loc-main"],
      additionalManagerIds: [],
      qualifiedPositionIds: ["pos-desk"],
      qualifiedTaskIds: [],
      employmentPercentage: 0.5,
    })).toMatchObject({
      id: "employee-1",
      legalName: "Employee One",
      email: "employee@stanford.edu",
      classification: "student_worker",
      active: true,
      setupComplete: true,
      targetWeeklyHours: 20,
      qualifiedPositionIds: ["pos-desk"],
    });
  });

  it("uses safe defaults for malformed stored profile fields", () => {
    expect(mapEmployeeProfile("employee-2", {
      email: "employee@stanford.edu",
      classification: "not-a-real-classification",
      targetWeeklyHours: "forty",
    })).toMatchObject({
      classification: "other",
      active: false,
      targetWeeklyHours: 0,
      eligibleLocationIds: [],
    });
  });

  it("maps availability records for live subscriptions", () => {
    expect(mapAvailabilityPattern("availability-1", {
      employeeId: "employee-1",
      blocks: [{ weekday: 1, start: 540, end: 1020, kind: "available" }],
      updatedBy: "admin-1",
      updatedAt: "2026-07-15T12:00:00.000Z",
    })).toMatchObject({
      id: "availability-1",
      employeeId: "employee-1",
      updatedAt: "2026-07-15T12:00:00.000Z",
    });
  });
});
