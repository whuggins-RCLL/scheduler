import { describe, expect, it } from "vitest";
import { isPurgeableDate, retentionCutoff, SCHEDULE_RETENTION_DAYS } from "../src/domain/retention";
import { buildSeed } from "../src/lib/store/seed";
import { purgeOldSchedules, upsertLocation, setScheduleTypeAccess, setTaskQualifications } from "../src/lib/store/actions";
import { addDays } from "../src/domain/time";
import type { Location, Shift } from "../src/domain/types";

const TODAY = "2026-07-16";
const NOW = "2026-07-16T12:00:00Z";

describe("retention window", () => {
  it("keeps 15 days and purges day 16+", () => {
    expect(SCHEDULE_RETENTION_DAYS).toBe(15);
    expect(retentionCutoff(TODAY)).toBe("2026-07-01");
    expect(isPurgeableDate("2026-07-01", TODAY)).toBe(false); // exactly 15 days back — retained
    expect(isPurgeableDate("2026-06-30", TODAY)).toBe(true); // 16 days back — purged
    expect(isPurgeableDate(TODAY, TODAY)).toBe(false);
    expect(isPurgeableDate(addDays(TODAY, 30), TODAY)).toBe(false); // future retained
  });
});

function shift(id: string, date: string): Shift {
  return {
    id, scheduleId: "sched-week", employeeId: "emp-1", positionId: "pos-desk", locationId: "loc-desk",
    date, start: 540, end: 780, breaks: [], taskIds: [], status: "published", source: "manager_created",
    locked: false, scheduleVersion: 1, createdAt: "", updatedAt: "",
  };
}

describe("purgeOldSchedules", () => {
  it("removes shifts older than the retention window and logs the purge", () => {
    let db = buildSeed();
    db = { ...db, shifts: [shift("keep", addDays(TODAY, -5)), shift("edge", "2026-07-01"), shift("old", "2026-06-15")] };
    const next = purgeOldSchedules(db, TODAY, "admin-whuggins", NOW);
    expect(next.shifts.map((s) => s.id).sort()).toEqual(["edge", "keep"]);
    expect(next.audit[0].action).toBe("schedule.purged");
  });

  it("is a no-op when nothing is stale", () => {
    const db = { ...buildSeed(), shifts: [shift("recent", TODAY)] };
    expect(purgeOldSchedules(db, TODAY, "admin-whuggins", NOW)).toBe(db);
  });
});

describe("schedule types + access", () => {
  it("adds a schedule type with its own operating-hours row", () => {
    const db = buildSeed();
    const loc: Location = {
      id: "loc-events", name: "Special Events", shortName: "Events", timeZone: "America/Los_Angeles",
      minStaffing: 0, openBufferMinutes: 0, closeBufferMinutes: 0, active: true,
    };
    const next = upsertLocation(db, loc, "admin-whuggins", NOW);
    expect(next.locations.some((l) => l.id === "loc-events")).toBe(true);
    expect(next.operatingHours.some((o) => o.locationId === "loc-events")).toBe(true);
    expect(next.audit[0].action).toBe("scheduleType.create");
  });

  it("sets per-employee schedule access and clears an orphaned primary location", () => {
    const db = buildSeed();
    const empId = db.employees[0].id;
    const next = setScheduleTypeAccess(db, empId, ["loc-stacks"], "admin-whuggins", NOW);
    const emp = next.employees.find((e) => e.id === empId)!;
    expect(emp.eligibleLocationIds).toEqual(["loc-stacks"]);
    // Seeded admins have primaryLocationId "loc-main"; revoking it reassigns to the remaining one.
    expect(emp.primaryLocationId).toBe("loc-stacks");
    expect(next.audit[0].action).toBe("scheduleType.access");
  });

  it("sets per-employee task qualifications", () => {
    const db = buildSeed();
    const empId = db.employees[0].id;
    const next = setTaskQualifications(db, empId, ["task-opening", "task-closing"], "admin-whuggins", NOW);
    const emp = next.employees.find((e) => e.id === empId)!;
    expect(emp.qualifiedTaskIds).toEqual(["task-opening", "task-closing"]);
    expect(next.audit[0].action).toBe("task.qualification");
  });
});
