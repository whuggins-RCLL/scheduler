import { describe, expect, it } from "vitest";
import { mapLeaveRecord } from "../src/lib/store/firestore-leave";

describe("Firestore leave mapping", () => {
  it("maps a stored all-day personal exception", () => {
    expect(mapLeaveRecord("leave-1", {
      employeeId: "employee-1",
      leaveTypeId: "lt-unavailable",
      startDate: "2026-08-01",
      endDate: "2026-08-03",
      partialDay: false,
      status: "recorded",
      enteredBy: "employee-1",
      createdAt: "2026-07-15T12:00:00.000Z",
      updatedAt: "2026-07-15T12:00:00.000Z",
    })).toMatchObject({
      id: "leave-1",
      employeeId: "employee-1",
      leaveTypeId: "lt-unavailable",
      startDate: "2026-08-01",
      endDate: "2026-08-03",
      partialDay: false,
      status: "recorded",
      start: undefined,
      end: undefined,
      updatedAt: "2026-07-15T12:00:00.000Z",
    });
  });

  it("preserves partial-day start/end minutes", () => {
    expect(mapLeaveRecord("leave-2", {
      employeeId: "employee-2",
      leaveTypeId: "lt-unavailable",
      startDate: "2026-08-05",
      endDate: "2026-08-05",
      partialDay: true,
      start: 540,
      end: 720,
      status: "recorded",
      enteredBy: "manager-1",
      note: "Doctor appointment",
    })).toMatchObject({
      partialDay: true,
      start: 540,
      end: 720,
      note: "Doctor appointment",
    });
  });

  it("uses safe defaults for malformed fields and defaults endDate to startDate", () => {
    const record = mapLeaveRecord("leave-3", {
      employeeId: "employee-3",
      startDate: "2026-08-09",
      status: "bogus-status",
    });
    expect(record).toMatchObject({
      leaveTypeId: "lt-unavailable",
      endDate: "2026-08-09",
      partialDay: false,
      status: "recorded",
      enteredBy: "system",
    });
  });
});
