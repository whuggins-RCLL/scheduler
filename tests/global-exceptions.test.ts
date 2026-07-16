import { describe, expect, it } from "vitest";
import { buildSeed } from "@/lib/store/seed";
import { emptyDatabase } from "@/lib/store/types";
import {
  deleteGlobalException,
  upsertGlobalException,
} from "@/lib/store/actions";
import { globalLeaveId } from "@/domain/global-exceptions";

const NOW = "2026-07-16T12:00:00.000Z";
const ACTOR = "admin-whuggins";

describe("global exceptions", () => {
  it("seeds Stanford university holidays and syncs to all active employees", () => {
    const db = buildSeed();
    expect(db.globalExceptions.length).toBeGreaterThan(10);
    const activeCount = db.employees.filter((e) => e.active).length;
    const holidayLeave = db.leave.filter((l) => l.globalExceptionId);
    expect(holidayLeave.length).toBe(db.globalExceptions.length * activeCount);
    for (const global of db.globalExceptions) {
      for (const employee of db.employees.filter((e) => e.active)) {
        const record = db.leave.find((l) => l.id === globalLeaveId(global.id, employee.id));
        expect(record).toBeDefined();
        expect(record?.partialDay).toBe(false);
        expect(record?.leaveTypeId).toBe("lt-holiday");
        expect(record?.startDate).toBe(global.startDate);
        expect(record?.endDate).toBe(global.endDate);
      }
    }
  });

  it("adds a new global exception to every active employee", () => {
    let db = buildSeed();
    db = upsertGlobalException(
      db,
      {
        id: "ge-custom",
        name: "Staff development day",
        startDate: "2026-08-15",
        endDate: "2026-08-15",
        createdBy: ACTOR,
        createdAt: NOW,
        updatedAt: NOW,
      },
      ACTOR,
      NOW,
    );
    const active = db.employees.filter((e) => e.active);
    expect(db.globalExceptions.some((g) => g.id === "ge-custom")).toBe(true);
    for (const employee of active) {
      const record = db.leave.find((l) => l.id === globalLeaveId("ge-custom", employee.id));
      expect(record?.note).toBe("Staff development day");
    }
  });

  it("updates synced leave when a global exception is edited", () => {
    let db = buildSeed();
    const target = db.globalExceptions.find((g) => g.id === "ge-labor-2026")!;
    db = upsertGlobalException(
      db,
      { ...target, endDate: "2026-09-08", name: "Labor Day (observed)" },
      ACTOR,
      NOW,
    );
    const employee = db.employees[0];
    const record = db.leave.find((l) => l.id === globalLeaveId("ge-labor-2026", employee.id));
    expect(record?.endDate).toBe("2026-09-08");
    expect(record?.note).toBe("Labor Day (observed)");
  });

  it("removes synced leave when a global exception is deleted", () => {
    let db = buildSeed();
    const before = db.leave.filter((l) => l.globalExceptionId === "ge-labor-2026").length;
    expect(before).toBeGreaterThan(0);
    db = deleteGlobalException(db, "ge-labor-2026", ACTOR, NOW);
    expect(db.globalExceptions.some((g) => g.id === "ge-labor-2026")).toBe(false);
    expect(db.leave.some((l) => l.globalExceptionId === "ge-labor-2026")).toBe(false);
  });

  it("does not create holiday leave for inactive employees", () => {
    let db = emptyDatabase();
    db.employees.push({
      id: "emp-inactive",
      legalName: "Inactive Person",
      email: "inactive@example.test",
      classification: "non_exempt_staff",
      eligibleLocationIds: [],
      additionalManagerIds: [],
      active: false,
      targetWeeklyHours: 40,
      minWeeklyHours: 0,
      maxWeeklyHours: 40,
      maxDailyHours: 8,
      earliestStart: 480,
      latestEnd: 1020,
      minTurnaroundMinutes: 480,
      overtimeEligible: false,
      breakPolicyId: "ca-nonexempt-v1",
      qualifiedPositionIds: [],
      qualifiedTaskIds: [],
      employmentPercentage: 1,
      googleCalendarConnected: false,
      notificationPrefs: { inApp: true, email: false, calendar: false, digest: false },
    });
    db.leaveTypes.push({
      id: "lt-holiday",
      name: "University holiday",
      paid: true,
      approvalRequired: false,
      countsAgainstBalance: false,
      visibility: "team_generic",
      blocksScheduling: true,
      requiresNote: false,
      employeeSelectable: false,
      eligibleClassifications: [],
      active: true,
    });
    db = upsertGlobalException(
      db,
      {
        id: "ge-test",
        name: "Test holiday",
        startDate: "2026-01-01",
        endDate: "2026-01-01",
        createdBy: ACTOR,
        createdAt: NOW,
        updatedAt: NOW,
      },
      ACTOR,
      NOW,
    );
    expect(db.leave.some((l) => l.employeeId === "emp-inactive")).toBe(false);
  });
});
