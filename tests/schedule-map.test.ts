import { describe, expect, it } from "vitest";
import { buildScheduleMap, mapCoverageMetrics, nodeId } from "../src/lib/schedule-map";
import { buildFixture } from "./fixtures";
import type { CoverageRequirement } from "../src/domain/scheduling";

describe("buildScheduleMap", () => {
  const db = buildFixture();
  const map = buildScheduleMap({ locations: db.locations, positions: db.positions, tasks: db.tasks });

  it("creates a node for every schedule type, position, and task", () => {
    expect(map.nodes.filter((n) => n.kind === "scheduleType")).toHaveLength(db.locations.length);
    expect(map.nodes.filter((n) => n.kind === "position")).toHaveLength(db.positions.length);
    expect(map.nodes.filter((n) => n.kind === "task")).toHaveLength(db.tasks.length);
  });

  it("lays kinds out in three left-to-right columns", () => {
    const typeX = map.nodes.find((n) => n.kind === "scheduleType")!.x;
    const posX = map.nodes.find((n) => n.kind === "position")!.x;
    const taskX = map.nodes.find((n) => n.kind === "task")!.x;
    expect(typeX).toBeLessThan(posX);
    expect(posX).toBeLessThan(taskX);
  });

  it("wires a position to each schedule type it is assigned to", () => {
    const deskPos = db.positions.find((p) => p.id === "pos-desk")!;
    for (const locId of deskPos.applicableLocationIds) {
      expect(
        map.edges.some(
          (e) =>
            e.kind === "type-position"
            && e.from === nodeId("scheduleType", locId)
            && e.to === nodeId("position", "pos-desk"),
        ),
      ).toBe(true);
    }
  });

  it("wires a task to its host position", () => {
    // fixture task-opening is hosted by pos-desk
    expect(
      map.edges.some(
        (e) => e.kind === "position-task" && e.from === nodeId("position", "pos-desk") && e.to === nodeId("task", "task-opening"),
      ),
    ).toBe(true);
  });

  it("attributes coverage to schedule type, host position, and task", () => {
    const reqs: CoverageRequirement[] = [
      // desk post coverage: 2 windows for pos-desk on loc-desk
      { id: "a", date: "2026-07-20", positionId: "pos-desk", locationId: "loc-desk", start: 480, end: 1020, count: 1 },
      { id: "b", date: "2026-07-21", positionId: "pos-desk", locationId: "loc-desk", start: 480, end: 1020, count: 1 },
      // a task window hosted at pos-desk on loc-desk, needing 2 people
      { id: "c", date: "2026-07-20", positionId: "pos-desk", locationId: "loc-desk", start: 480, end: 510, count: 2, taskIds: ["task-opening"] },
    ];
    const m = mapCoverageMetrics(reqs);
    expect(m.byScheduleType["loc-desk"]).toEqual({ windows: 3, slots: 4 });
    expect(m.byPosition["pos-desk"]).toEqual({ windows: 2, slots: 2 }); // only post coverage
    expect(m.byTask["task-opening"]).toEqual({ windows: 1, slots: 2 });
    expect(m.totalWindows).toBe(3);
    expect(m.totalSlots).toBe(4);
  });

  it("badges a task with no explicit schedule types as universal", () => {
    const universalTask = { ...db.tasks[0]!, id: "task-anywhere", applicableLocationIds: [], applicablePositionIds: [] };
    const m = buildScheduleMap({ locations: db.locations, positions: db.positions, tasks: [universalTask] });
    const node = m.nodes.find((n) => n.entityId === "task-anywhere")!;
    expect(node.universal).toBe(true);
    expect(m.edges.filter((e) => e.kind === "type-task")).toHaveLength(0);
  });
});
