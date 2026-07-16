import { describe, expect, it } from "vitest";
import {
  coverageDeadlinePassed,
  coveredDeskIntervals,
  deskCoverageForDate,
  deskCoverageGaps,
  deskOpenIntervalsForDate,
  hasDeclinedCoverage,
  isDeskShift,
  visibleCoverageRequests,
} from "../src/domain/desk-coverage";
import type { OperatingHours, Shift, SwapRequest } from "../src/domain/types";

const T = (h: number, m = 0) => h * 60 + m;

const deskHours: OperatingHours = {
  locationId: "loc-desk",
  weekly: { 0: [], 1: [{ start: T(9), end: T(17) }], 2: [{ start: T(9), end: T(17) }], 3: [], 4: [], 5: [], 6: [] },
  exceptions: [{ date: "2026-07-15", closed: false, intervals: [{ start: T(9), end: T(12) }], source: "manual" }],
};

function deskShift(over: Partial<Shift> = {}): Shift {
  return {
    id: "s1", scheduleId: "sched", employeeId: "emp-1", positionId: "pos-desk", locationId: "loc-desk",
    date: "2026-07-13", start: T(9), end: T(13), breaks: [], taskIds: [], status: "published",
    source: "manager_created", locked: false, scheduleVersion: 1, createdAt: "", updatedAt: "", ...over,
  };
}

describe("desk open intervals", () => {
  it("uses weekly hours by weekday and honors dated exceptions", () => {
    expect(deskOpenIntervalsForDate(deskHours, "2026-07-13")).toEqual([{ start: T(9), end: T(17) }]); // Monday
    expect(deskOpenIntervalsForDate(deskHours, "2026-07-18")).toEqual([]); // Saturday closed
    expect(deskOpenIntervalsForDate(deskHours, "2026-07-15")).toEqual([{ start: T(9), end: T(12) }]); // exception
    expect(deskOpenIntervalsForDate(undefined, "2026-07-13")).toEqual([]);
  });
});

describe("desk coverage gaps", () => {
  it("flags the entire open day when nothing is scheduled", () => {
    const cov = deskCoverageForDate(deskHours, [], "2026-07-13");
    expect(cov.gaps).toEqual([{ start: T(9), end: T(17) }]);
    expect(cov.gapMinutes).toBe(8 * 60);
  });

  it("subtracts assigned desk shifts (and their breaks) from the open window", () => {
    const shifts = [deskShift({ start: T(9), end: T(13), breaks: [{ kind: "meal", start: T(11), end: T(11, 30), paid: false }] })];
    const cov = deskCoverageForDate(deskHours, shifts, "2026-07-13");
    // Covered 9–11 and 11:30–13; gaps 11–11:30 and 13–17.
    expect(cov.gaps).toEqual([
      { start: T(11), end: T(11, 30) },
      { start: T(13), end: T(17) },
    ]);
  });

  it("ignores unassigned/cancelled/non-desk shifts", () => {
    const covered = coveredDeskIntervals(
      [
        deskShift({ employeeId: null }),
        deskShift({ id: "s2", status: "cancelled" }),
        deskShift({ id: "s3", locationId: "loc-main", positionId: "pos-stacks" }),
      ],
      "2026-07-13",
      { deskPositionIds: ["pos-desk"] },
    );
    expect(covered).toEqual([]);
  });

  it("counts a non-desk position at the desk location as coverage", () => {
    expect(isDeskShift(deskShift({ positionId: "pos-other" }))).toBe(true); // desk location
    expect(deskCoverageGaps([{ start: T(9), end: T(17) }], [{ start: T(9), end: T(17) }])).toEqual([]);
  });
});

describe("coverage request lifecycle", () => {
  const shift = deskShift({ id: "sh", date: "2026-07-20", start: T(10), end: T(14) });
  const req: SwapRequest = {
    id: "cover-1", kind: "give_up", shiftId: "sh", fromEmployeeId: "emp-1", toEmployeeId: null,
    status: "pending", createdAt: "", history: [{ at: "", actor: "emp-1", action: "coverage_requested" }],
  };

  it("passes the deadline once the shift has started", () => {
    expect(coverageDeadlinePassed(shift, { date: "2026-07-19", minute: T(23) })).toBe(false);
    expect(coverageDeadlinePassed(shift, { date: "2026-07-20", minute: T(9, 59) })).toBe(false);
    expect(coverageDeadlinePassed(shift, { date: "2026-07-20", minute: T(10) })).toBe(true);
    expect(coverageDeadlinePassed(shift, { date: "2026-07-21", minute: 0 })).toBe(true);
  });

  it("shows open requests to others but hides own, declined, and expired", () => {
    const now = { date: "2026-07-19", minute: T(12) };
    // Owner does not see their own request.
    expect(visibleCoverageRequests([req], [shift], "emp-1", now)).toHaveLength(0);
    // A teammate sees it.
    expect(visibleCoverageRequests([req], [shift], "emp-2", now)).toHaveLength(1);
    // After declining, it disappears for that teammate.
    const declined: SwapRequest = { ...req, history: [...req.history, { at: "", actor: "emp-2", action: "decline_help" }] };
    expect(hasDeclinedCoverage(declined, "emp-2")).toBe(true);
    expect(visibleCoverageRequests([declined], [shift], "emp-2", now)).toHaveLength(0);
    // Past the deadline it disappears for everyone.
    expect(visibleCoverageRequests([req], [shift], "emp-2", { date: "2026-07-20", minute: T(10) })).toHaveLength(0);
  });
});
