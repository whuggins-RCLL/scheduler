import { describe, expect, it } from "vitest";
import { defaultTasks } from "../src/lib/store/default-tasks";
import { mapTask } from "../src/lib/store/firestore-tasks";

describe("default task catalog", () => {
  it("restores the full 27-task RCLL catalog with stable ids", () => {
    const tasks = defaultTasks();
    expect(tasks).toHaveLength(27);
    expect(tasks.map((t) => t.id)).toEqual([
      "task-desk-1-staff",
      "task-desk-2-staff",
      "task-desk-1-student",
      "task-desk-2-student",
      "task-unpaid-meal-30",
      "task-unpaid-meal-60",
      "task-paid-break-15",
      "task-building-walkthrough",
      "task-shelving",
      "task-shelf-reading",
      "task-dusting",
      "task-shifting",
      "task-open-library",
      "task-close-library",
      "task-scanning-law-journals",
      "task-scanning-general",
      "task-holds-pull-list",
      "task-faculty-borrowing",
      "task-meeting-30",
      "task-meeting-60",
      "task-professional-development",
      "task-admin-time",
      "task-reserves-processing",
      "task-ill-processing",
      "task-event-support",
      "task-libanswers",
      "task-other-duties",
    ]);
    expect(tasks.find((t) => t.id === "task-desk-1-staff")).toMatchObject({
      name: "Desk 1 (Staff)",
      category: "Borrowing Services",
      priority: "high",
      estimatedMinutes: 120,
    });
    expect(tasks.find((t) => t.id === "task-open-library")).toMatchObject({
      openingDependency: true,
      maxAssignees: 2,
    });
    expect(tasks.find((t) => t.id === "task-professional-development")).toMatchObject({
      maxAssignees: 20,
    });
  });
});

describe("Firestore task mapping", () => {
  it("maps a complete task document", () => {
    expect(mapTask("task-shelving", {
      name: "Shelving",
      category: "General",
      colorToken: "task-collections",
      icon: "book",
      applicableLocationIds: ["loc-main"],
      estimatedMinutes: 60,
      priority: "normal",
      minAssignees: 1,
      maxAssignees: 1,
      allowedDuringPosition: true,
      requiresAcknowledgement: false,
      checklist: ["Sort carts"],
      openingDependency: false,
      closingDependency: false,
      order: 8,
      active: true,
    })).toMatchObject({
      id: "task-shelving",
      name: "Shelving",
      checklist: ["Sort carts"],
      active: true,
    });
  });

  it("uses safe defaults for malformed stored task fields", () => {
    expect(mapTask("task-x", {
      name: "Broken",
      priority: "not-real",
      estimatedMinutes: "sixty",
      active: false,
    })).toMatchObject({
      priority: "normal",
      estimatedMinutes: 30,
      active: false,
      checklist: [],
    });
  });
});
