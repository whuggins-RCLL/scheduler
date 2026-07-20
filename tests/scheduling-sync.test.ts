import { describe, expect, it } from "vitest";
import {
  diffForSync,
  scheduleSignature,
  shiftSignature,
  snapshotOf,
  type SyncSnapshot,
} from "../src/lib/store/scheduling-sync";
import type { Schedule, Shift } from "../src/domain/types";

function schedule(overrides: Partial<Schedule> = {}): Schedule {
  return {
    id: "sched1",
    name: "Week of Jul 20",
    startDate: "2026-07-20",
    endDate: "2026-07-26",
    status: "draft",
    version: 1,
    createdBy: "u1",
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
    ...overrides,
  };
}

function shift(overrides: Partial<Shift> = {}): Shift {
  return {
    id: "sh1",
    scheduleId: "sched1",
    employeeId: "u1",
    positionId: "pos-desk",
    locationId: "loc-main",
    date: "2026-07-20",
    start: 540,
    end: 780,
    breaks: [],
    taskIds: [],
    status: "draft",
    source: "manager_created",
    locked: false,
    scheduleVersion: 1,
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
    ...overrides,
  };
}

describe("signatures", () => {
  it("change when a meaningful field changes", () => {
    expect(shiftSignature(shift())).toBe(shiftSignature(shift()));
    expect(shiftSignature(shift())).not.toBe(shiftSignature(shift({ updatedAt: "2026-07-02T00:00:00Z" })));
    expect(shiftSignature(shift())).not.toBe(shiftSignature(shift({ status: "published" })));
    expect(shiftSignature(shift())).not.toBe(shiftSignature(shift({ employeeId: null })));
    expect(scheduleSignature(schedule())).not.toBe(scheduleSignature(schedule({ status: "published" })));
  });

  it("is stable across break object key order", () => {
    const a = shift({ breaks: [{ kind: "meal", start: 660, end: 690, paid: false }] });
    // Same break, different literal key order — signature must match.
    const b = shift({ breaks: [{ paid: false, end: 690, start: 660, kind: "meal" } as Shift["breaks"][number]] });
    expect(shiftSignature(a)).toBe(shiftSignature(b));
  });
});

describe("diffForSync", () => {
  it("writes everything against an empty snapshot (first-load bootstrap)", () => {
    const items = [shift({ id: "a" }), shift({ id: "b" })];
    const { writes, next } = diffForSync(new Map(), items, shiftSignature);
    expect(writes.map((w) => w.id)).toEqual(["a", "b"]);
    expect(next.size).toBe(2);
  });

  it("writes nothing when the snapshot already matches (echo suppression)", () => {
    const items = [shift({ id: "a" }), shift({ id: "b" })];
    const snapshot = snapshotOf(items, shiftSignature);
    const { writes } = diffForSync(snapshot, items, shiftSignature);
    expect(writes).toEqual([]);
  });

  it("writes only the changed doc", () => {
    const items = [shift({ id: "a" }), shift({ id: "b" })];
    const snapshot = snapshotOf(items, shiftSignature);
    const mutated = [items[0], shift({ id: "b", status: "published", updatedAt: "2026-07-03T00:00:00Z" })];
    const { writes, next } = diffForSync(snapshot, mutated, shiftSignature);
    expect(writes.map((w) => w.id)).toEqual(["b"]);
    // Snapshot now reflects the mutated doc, so a repeat diff is a no-op.
    expect(diffForSync(next, mutated, shiftSignature).writes).toEqual([]);
  });

  it("does not treat a removed item as a write (removals are status changes, not deletes)", () => {
    const snapshot = snapshotOf([shift({ id: "a" }), shift({ id: "b" })], shiftSignature);
    const { writes, next } = diffForSync(snapshot, [shift({ id: "a" })], shiftSignature);
    expect(writes).toEqual([]);
    expect(next.has("b")).toBe(false); // dropped from snapshot, but never deleted in Firestore
  });
});
