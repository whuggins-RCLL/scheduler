import { describe, expect, it } from "vitest";
import {
  findAvailabilityConflicts,
  isAvailableForShift,
  resolveAvailability,
} from "../src/domain/availability";
import type { AvailabilityPattern, LeaveRecord, LeaveType } from "../src/domain/types";

const pattern: AvailabilityPattern = {
  id: "p1",
  employeeId: "e1",
  blocks: [
    { weekday: 1, start: 540, end: 720, kind: "preferred" }, // Mon 9-12
    { weekday: 1, start: 720, end: 900, kind: "available" }, // Mon 12-15
    { weekday: 1, start: 900, end: 1020, kind: "unavailable" }, // Mon 15-17
  ],
  updatedBy: "e1",
  updatedAt: "2026-07-13T00:00:00Z",
};

const leaveTypes: LeaveType[] = [
  { id: "lt-vac", name: "Vacation", paid: true, approvalRequired: true, countsAgainstBalance: true, visibility: "team_generic", blocksScheduling: true, requiresNote: false, eligibleClassifications: [], employeeSelectable: true, active: true },
  { id: "lt-appt", name: "Appointment", paid: false, approvalRequired: false, countsAgainstBalance: false, visibility: "manager", blocksScheduling: false, requiresNote: false, eligibleClassifications: [], employeeSelectable: true, active: true },
];

describe("availability resolution", () => {
  it("classifies preferred, available, and unavailable windows", () => {
    // Monday 2026-07-13
    expect(resolveAvailability([pattern], [], leaveTypes, "2026-07-13", { start: 540, end: 660 }).kind).toBe("preferred");
    expect(resolveAvailability([pattern], [], leaveTypes, "2026-07-13", { start: 750, end: 840 }).kind).toBe("available");
    expect(resolveAvailability([pattern], [], leaveTypes, "2026-07-13", { start: 930, end: 990 }).kind).toBe("unavailable");
  });

  it("treats a window spanning preferred+available as available, not preferred", () => {
    expect(resolveAvailability([pattern], [], leaveTypes, "2026-07-13", { start: 660, end: 780 }).kind).toBe("available");
  });

  it("blocks scheduling during blocking leave but warns for non-blocking leave", () => {
    const vac: LeaveRecord = { id: "l1", employeeId: "e1", leaveTypeId: "lt-vac", startDate: "2026-07-13", endDate: "2026-07-13", partialDay: false, status: "approved", enteredBy: "e1", createdAt: "", updatedAt: "" };
    expect(isAvailableForShift([pattern], [vac], leaveTypes, "2026-07-13", { start: 540, end: 660 })).toBe(false);

    const appt: LeaveRecord = { ...vac, id: "l2", leaveTypeId: "lt-appt" };
    // non-blocking leave does not hard-block availability
    expect(isAvailableForShift([pattern], [appt], leaveTypes, "2026-07-13", { start: 540, end: 660 })).toBe(true);
  });

  it("flags overlapping availability blocks", () => {
    const bad: AvailabilityPattern = { ...pattern, blocks: [
      { weekday: 2, start: 540, end: 720, kind: "preferred" },
      { weekday: 2, start: 600, end: 800, kind: "available" },
    ] };
    expect(findAvailabilityConflicts(bad).length).toBeGreaterThan(0);
  });
});
