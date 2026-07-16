import { describe, expect, it } from "vitest";
import { buildSeed } from "@/lib/store/seed";
import { emptyDatabase } from "@/lib/store/types";
import {
  deleteGlobalException,
  syncAllGlobalExceptions,
  upsertGlobalException,
} from "@/lib/store/actions";
import {
  activeGlobalExceptions,
  dedupeGlobalsByName,
  globalLeaveId,
  globalLeaveRecordsForEmployee,
  leaveRecordsForEmployee,
} from "@/domain/global-exceptions";
import { humanDateRange } from "@/lib/ui";

const NOW = "2026-07-16T12:00:00.000Z";
const ACTOR = "admin-whuggins";

describe("global exceptions", () => {
  it("seeds Stanford university holidays and syncs to all active employees", () => {
    const db = buildSeed();
    expect(db.globalExceptions.length).toBe(9);
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

  it("derives university-wide exceptions for display even before leave sync", () => {
    let db = buildSeed();
    const employee = db.employees.find((e) => e.active)!;
    db = { ...db, leave: db.leave.filter((l) => !l.globalExceptionId) };
    const derived = globalLeaveRecordsForEmployee(db, employee.id);
    expect(derived.length).toBe(db.globalExceptions.length);
    expect(derived.every((record) => record.partialDay === false)).toBe(true);
  });

  it("merges university-wide and personal exceptions for scheduling", () => {
    const db = buildSeed();
    const employee = db.employees[0];
    const merged = leaveRecordsForEmployee(db, employee.id);
    expect(merged.some((l) => l.globalExceptionId)).toBe(true);
    expect(merged.length).toBeGreaterThanOrEqual(db.globalExceptions.length);
  });

  it("syncs university holidays to active user accounts without employee profiles", () => {
    let db = buildSeed();
    db = {
      ...db,
      users: [
        ...db.users,
        {
          id: "user-student-namig",
          email: "namig@stanford.edu",
          displayName: "Namig Abbasov",
          state: "active",
          roles: [{ role: "EMPLOYEE" }],
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
      employees: db.employees.filter((e) => e.id !== "user-student-namig"),
      leave: db.leave.filter((l) => l.employeeId !== "user-student-namig"),
    };
    db = syncAllGlobalExceptions(db, ACTOR, NOW);
    const derived = globalLeaveRecordsForEmployee(db, "user-student-namig");
    expect(derived.length).toBe(db.globalExceptions.length);
    expect(db.leave.filter((l) => l.employeeId === "user-student-namig" && l.globalExceptionId).length).toBe(
      db.globalExceptions.length,
    );
  });

  it("dedupes the same holiday name across years for display", () => {
    const globals = [
      { id: "ge-labor-2026", name: "Labor Day", startDate: "2026-09-07", endDate: "2026-09-07", createdBy: ACTOR, createdAt: NOW, updatedAt: NOW },
      { id: "ge-labor-2027", name: "Labor Day", startDate: "2027-09-06", endDate: "2027-09-06", createdBy: ACTOR, createdAt: NOW, updatedAt: NOW },
    ];
    const deduped = dedupeGlobalsByName([...globals], "2026-07-16");
    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.id).toBe("ge-labor-2026");
    const nextYear = dedupeGlobalsByName([...globals], "2027-01-02");
    expect(nextYear[0]?.id).toBe("ge-labor-2027");
  });

  it("shows each active global holiday once per user", () => {
    const db = buildSeed();
    const accountId = db.users[0].id;
    const withDupes = {
      ...db,
      globalExceptions: [
        ...db.globalExceptions,
        {
          id: "ge-labor-2027",
          name: "Labor Day",
          startDate: "2027-09-06",
          endDate: "2027-09-06",
          createdBy: ACTOR,
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
    };
    const records = globalLeaveRecordsForEmployee(withDupes, accountId);
    expect(records.filter((r) => r.note === "Labor Day")).toHaveLength(1);
    expect(records).toHaveLength(activeGlobalExceptions(withDupes, "2026-07-16").length);
  });

  it("formats exception dates with the year", () => {
    expect(humanDateRange("2026-07-03", "2026-07-03")).toBe("Fri 7/3/2026");
    expect(humanDateRange("2026-12-24", "2026-12-25")).toBe("Thu 12/24–Fri 12/25, 2026");
    expect(humanDateRange("2026-12-21", "2027-01-01")).toBe("Mon 12/21/2026–Fri 1/1/2027");
  });

  it("shows a unified exceptions list with university-wide and personal entries", () => {
    let db = buildSeed();
    const accountId = db.users[0].id;
    db = {
      ...db,
      leave: [
        ...db.leave,
        {
          id: "leave-personal-1",
          employeeId: accountId,
          leaveTypeId: "lt-unavailable",
          startDate: "2026-08-01",
          endDate: "2026-08-01",
          partialDay: false,
          status: "recorded",
          enteredBy: accountId,
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
    };
    const merged = leaveRecordsForEmployee(db, accountId);
    expect(merged.some((l) => l.globalExceptionId)).toBe(true);
    expect(merged.some((l) => l.id === "leave-personal-1")).toBe(true);
  });
});
