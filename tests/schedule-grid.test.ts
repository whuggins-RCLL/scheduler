import { describe, expect, it } from "vitest";
import { buildFixture } from "./fixtures";
import { entriesForCell, slotOverlaps, deskSlotUncovered } from "../src/lib/schedule-grid";
import {
  defaultGridColumns,
  DESK_COLUMN_ID,
  mergeGridColumns,
  visibleColumns,
} from "../src/lib/schedule-grid-preferences";
import { GRID_SLOT_MINUTES } from "../src/lib/schedule-view";

describe("slotOverlaps", () => {
  it("detects half-hour overlap", () => {
    const slot = 9 * 60; // 09:00
    expect(slotOverlaps(9 * 60, 10 * 60, slot)).toBe(true);
    expect(slotOverlaps(9 * 60 + 15, 9 * 60 + 45, slot)).toBe(true);
    expect(slotOverlaps(10 * 60, 11 * 60, slot)).toBe(false);
  });
});

describe("defaultGridColumns", () => {
  it("places borrowing desk first, then tasks, then breaks", () => {
    const db = buildFixture();
    const cols = defaultGridColumns(db.tasks);
    expect(cols[0]?.id).toBe(DESK_COLUMN_ID);
    expect(cols[cols.length - 2]?.kind).toBe("rest");
    expect(cols[cols.length - 1]?.kind).toBe("meal");
    const taskCols = cols.filter((c) => c.kind === "task");
    expect(taskCols.length).toBe(db.tasks.filter((t) => t.active).length);
  });
});

describe("mergeGridColumns", () => {
  it("preserves visibility and order for existing columns", () => {
    const db = buildFixture();
    const base = defaultGridColumns(db.tasks);
    const saved = base.map((c, i) => ({ ...c, visible: c.kind !== "task", order: base.length - 1 - i }));
    const merged = mergeGridColumns(saved, db.tasks);
    const shelving = merged.find((c) => c.taskId === "task-shelving");
    expect(shelving?.visible).toBe(false);
    expect(merged[0]?.id).toBe(saved.find((c) => c.order === 0)?.id);
  });
});

describe("entriesForCell", () => {
  const db = buildFixture();
  const deskCol = defaultGridColumns(db.tasks).find((c) => c.id === DESK_COLUMN_ID)!;
  const openingCol = defaultGridColumns(db.tasks).find((c) => c.taskId === "task-opening")!;
  const restCol = defaultGridColumns(db.tasks).find((c) => c.kind === "rest")!;
  const shifts = db.shifts;
  const empName = (id: string | null) => (id === "emp-sam" ? "Sam" : id ?? "Open");
  const posName = () => "Desk";

  it("shows desk staff excluding break slots", () => {
    const slot = 11 * 60; // Sam on rest break 11:00–11:10
    const entries = entriesForCell(shifts, deskCol, slot, {
      deskPositionId: "pos-desk",
      deskLocationId: "loc-desk",
      empName,
      posName,
    });
    expect(entries.some((e) => e.label === "Sam")).toBe(false);
  });

  it("shows opening task on Sam's morning shift", () => {
    const slot = 9 * 60;
    const entries = entriesForCell(shifts, openingCol, slot, {
      deskPositionId: "pos-desk",
      empName,
      posName,
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.label).toBe("Sam");
  });

  it("shows rest break column during break window", () => {
    const slot = 11 * 60;
    const entries = entriesForCell(shifts, restCol, slot, {
      empName,
      posName,
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.breakKind).toBe("rest");
  });
});

describe("deskSlotUncovered", () => {
  it("flags gaps when coverage is unstaffed", () => {
    const db = buildFixture();
    const date = db.schedules[0]!.startDate;
    const slot = 15 * 60; // Monday 15:00 — desk should be covered but only Jordan on project
    const uncovered = deskSlotUncovered(db.shifts, slot, db.coverage, date, "pos-desk");
    expect(uncovered).toBe(true);
  });

  it("is clear when desk is staffed", () => {
    const db = buildFixture();
    const date = db.schedules[0]!.startDate;
    const slot = 9 * 60;
    expect(deskSlotUncovered(db.shifts, slot, db.coverage, date, "pos-desk")).toBe(false);
  });
});

describe("visibleColumns", () => {
  it("filters hidden columns", () => {
    const db = buildFixture();
    const cols = defaultGridColumns(db.tasks).map((c) => ({ ...c, visible: c.kind === "desk" }));
    const visible = visibleColumns({ colorScheme: "cardinal", columns: cols, showHalfHourLines: true, compactCells: false });
    expect(visible).toHaveLength(1);
    expect(visible[0]?.kind).toBe("desk");
  });
});

describe("grid slot geometry", () => {
  it("uses 30-minute slots across the staffed day", () => {
    expect(GRID_SLOT_MINUTES).toBe(30);
  });
});
