import { describe, expect, it } from "vitest";
import { summarizeCoverage } from "../src/lib/coverage-preview";
import { analyzeScheduleGaps, resolveScheduleCoverage } from "../src/lib/store/actions";
import { buildCoverageRequirements } from "../src/domain/coverage-generation";
import { buildFixture } from "./fixtures";
import type { CoverageRequirement } from "../src/domain/scheduling";

const names = {
  locationLabel: (id: string) => (id === "loc-desk" ? "Borrowing Services Desk" : id),
  positionLabel: (id: string) => (id === "pos-desk" ? "Desk" : id),
  taskLabel: (id: string) => (id === "task-open" ? "Open the Library" : id),
};

function req(overrides: Partial<CoverageRequirement>): CoverageRequirement {
  return {
    id: overrides.id ?? "r",
    date: overrides.date ?? "2026-07-20",
    positionId: overrides.positionId ?? "pos-desk",
    locationId: overrides.locationId ?? "loc-desk",
    start: overrides.start ?? 480,
    end: overrides.end ?? 1020,
    count: overrides.count ?? 1,
    taskIds: overrides.taskIds,
  };
}

describe("summarizeCoverage", () => {
  it("collapses a recurring window into one row with a day count", () => {
    const reqs = ["2026-07-20", "2026-07-21", "2026-07-22"].map((date, i) =>
      req({ id: `r${i}`, date }),
    );
    const summary = summarizeCoverage(reqs, names);
    expect(summary.rows).toHaveLength(1);
    expect(summary.rows[0]).toMatchObject({ label: "Desk", kind: "position", days: 3, count: 1 });
    expect(summary.totalWindows).toBe(3);
    expect(summary.totalSlots).toBe(3);
  });

  it("separates task windows from post windows and labels them", () => {
    const summary = summarizeCoverage(
      [
        req({ id: "a", start: 480, end: 1020 }),
        req({ id: "b", start: 480, end: 510, taskIds: ["task-open"], count: 2 }),
      ],
      names,
    );
    expect(summary.rows).toHaveLength(2);
    const task = summary.rows.find((r) => r.kind === "task");
    expect(task).toMatchObject({ label: "Open the Library", count: 2 });
    expect(summary.totalSlots).toBe(3);
  });
});

describe("analyzeScheduleGaps", () => {
  const NOW = "2026-07-20T00:00:00.000Z";

  it("reports every required slot as a gap when there is no staff", () => {
    const db = buildFixture();
    db.employees = []; // nobody to cover anything
    db.shifts = []; // and no pre-committed shifts
    const gaps = analyzeScheduleGaps(db, "sched-week", NOW);
    expect(gaps.total).toBeGreaterThan(0);
    const summed = Object.values(gaps.byScheduleType).reduce((a, b) => a + b, 0);
    expect(summed).toBe(gaps.total); // attribution sums to the total
  });

  it("returns an empty analysis when there are no requirements", () => {
    const db = buildFixture();
    db.coverage = [];
    db.positions = db.positions.map((p) => ({ ...p, frequency: undefined }));
    db.tasks = db.tasks.map((t) => ({ ...t, frequency: undefined }));
    const gaps = analyzeScheduleGaps(db, "sched-week", NOW);
    expect(gaps.total).toBe(0);
  });
});

describe("resolveScheduleCoverage", () => {
  it("derives coverage from cadence when none is authored", () => {
    const db = buildFixture();
    db.coverage = [];
    db.positions = db.positions.map((p) =>
      p.id === "pos-desk" ? { ...p, frequency: { mode: "per_operational_hour", count: 1, weekdays: [] } } : p,
    );
    const resolved = resolveScheduleCoverage(db, "sched-week");
    expect(resolved.source).toBe("derived");
    expect(resolved.requirements.length).toBeGreaterThan(0);
  });

  it("prefers hand-authored coverage when present", () => {
    const db = buildFixture();
    const authored = buildCoverageRequirements({
      positions: db.positions.map((p) => (p.id === "pos-desk" ? { ...p, frequency: { mode: "per_operational_hour" as const, count: 1, weekdays: [] } } : p)),
      tasks: [],
      operatingHours: db.operatingHours,
      dates: [db.schedules[0]!.startDate],
    }).requirements;
    db.coverage = authored;
    const resolved = resolveScheduleCoverage(db, "sched-week");
    expect(resolved.source).toBe("authored");
    expect(resolved.requirements).toEqual(authored);
    expect(resolved.skipped).toEqual([]);
  });
});
