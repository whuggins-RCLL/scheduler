import { describe, expect, it } from "vitest";
import { DEPARTMENTS } from "../src/lib/store/departments";
import { mapDepartment, mapLocation, mapPosition } from "../src/lib/store/firestore-config";
import {
  positionScheduleTypeIds,
  taskAppliesToScheduleType,
  tasksByScheduleType,
} from "../src/lib/schedule-type-links";
import type { Location, Position, Task } from "../src/domain/types";

describe("departments", () => {
  it("lists the four RCLL departments", () => {
    expect(DEPARTMENTS.map((d) => d.name)).toEqual([
      "Library Technology and Innovation",
      "Library Experience and Resources",
      "Research and Instruction",
      "Administration",
    ]);
  });
});

describe("Firestore config mapping", () => {
  it("maps a position with applicable schedule types", () => {
    expect(mapPosition("pos-desk", {
      name: "Desk",
      shortLabel: "Desk",
      applicableLocationIds: ["loc-desk", "loc-main"],
      active: true,
    })).toMatchObject({
      id: "pos-desk",
      applicableLocationIds: ["loc-desk", "loc-main"],
    });
  });

  it("falls back to legacy locationId when applicableLocationIds is empty", () => {
    expect(mapPosition("pos-x", {
      name: "Stacks",
      shortLabel: "Stacks",
      locationId: "loc-stacks",
      active: true,
    }).applicableLocationIds).toEqual(["loc-stacks"]);
  });

  it("maps schedule types and departments", () => {
    expect(mapLocation("loc-desk", {
      name: "Borrowing Services Desk",
      shortName: "Desk",
      minStaffing: 1,
      active: true,
    })).toMatchObject({ id: "loc-desk", minStaffing: 1 });

    expect(mapDepartment("dept-admin", {
      name: "Administration",
      active: true,
    })).toMatchObject({ id: "dept-admin", name: "Administration" });
  });
});

describe("schedule type links", () => {
  const locations: Location[] = [
    { id: "loc-desk", name: "Desk", shortName: "Desk", timeZone: "America/Los_Angeles", minStaffing: 1, openBufferMinutes: 0, closeBufferMinutes: 0, active: true },
    { id: "loc-stacks", name: "Stacks", shortName: "Stacks", timeZone: "America/Los_Angeles", minStaffing: 0, openBufferMinutes: 0, closeBufferMinutes: 0, active: true },
  ];
  const tasks: Task[] = [
    {
      id: "t1", name: "Desk duty", category: "Desk", colorToken: "x", icon: "x",
      applicableLocationIds: ["loc-desk"], applicablePositionIds: [], estimatedMinutes: 30,
      priority: "normal", minAssignees: 1, maxAssignees: 1, allowedDuringPosition: true,
      requiresAcknowledgement: false, checklist: [], openingDependency: false, closingDependency: false,
      order: 0, active: true,
    },
    {
      id: "t2", name: "Shelving", category: "Stacks", colorToken: "x", icon: "x",
      applicableLocationIds: [], applicablePositionIds: [], estimatedMinutes: 30,
      priority: "normal", minAssignees: 1, maxAssignees: 1, allowedDuringPosition: true,
      requiresAcknowledgement: false, checklist: [], openingDependency: false, closingDependency: false,
      order: 1, active: true,
    },
  ];

  it("resolves position schedule types from applicableLocationIds", () => {
    const position = {
      locationId: "loc-desk",
      applicableLocationIds: ["loc-desk", "loc-stacks"],
    } satisfies Pick<Position, "locationId" | "applicableLocationIds">;
    expect(positionScheduleTypeIds(position)).toEqual(["loc-desk", "loc-stacks"]);
  });

  it("treats empty task location list as universal", () => {
    expect(taskAppliesToScheduleType(tasks[1], "loc-desk")).toBe(true);
    expect(taskAppliesToScheduleType(tasks[0], "loc-stacks")).toBe(false);
  });

  it("groups tasks into schedule type sections", () => {
    const sections = tasksByScheduleType(tasks, locations);
    expect(sections.map((s) => s.label)).toEqual(["Desk", "All schedule types"]);
    expect(sections.find((s) => s.label === "Desk")?.tasks.map((t) => t.id)).toEqual(["t1"]);
  });
});
