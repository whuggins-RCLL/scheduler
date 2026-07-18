import { describe, expect, it } from "vitest";
import { consolidateMyDay } from "../src/lib/my-schedule";
import type { Shift } from "../src/domain/types";

function mk(over: Partial<Shift> & Pick<Shift, "id" | "locationId" | "start" | "end">): Shift {
  return {
    scheduleId: "s", employeeId: "emp", positionId: "pos", date: "2026-07-20",
    breaks: [], taskIds: [], status: "published", source: "manager_created",
    locked: false, scheduleVersion: 1, createdAt: "", updatedAt: "", ...over,
  };
}

const resolvers = {
  scheduleTypeName: (id: string) =>
    ({ "loc-desk": "Borrowing Services Desk", "loc-stacks": "Students Stacks" })[id] ?? id,
  positionName: (id: string) => ({ "pos-desk": "Desk", "pos-stacks": "Stacks" })[id],
  taskName: (id: string) => id,
  colorVar: () => "var(--x)",
};

describe("consolidateMyDay", () => {
  it("merges a person's assignments across schedule types plus breaks into one ordered timeline", () => {
    // The scenario from the request: desk 8–9 and 9–10, stacks 10–11 with a
    // 10:00–10:15 break — all should list together in time order.
    const shifts: Shift[] = [
      mk({ id: "a", locationId: "loc-desk", positionId: "pos-desk", start: 480, end: 540 }),
      mk({ id: "b", locationId: "loc-desk", positionId: "pos-desk", start: 540, end: 600 }),
      mk({
        id: "c", locationId: "loc-stacks", positionId: "pos-stacks", start: 600, end: 660,
        breaks: [{ kind: "rest", start: 600, end: 615, paid: true }],
      }),
    ];
    const entries = consolidateMyDay(shifts, resolvers);

    // desk×2 work + stacks work + one break = 4 entries, time-ordered.
    expect(entries).toHaveLength(4);
    expect(entries.map((e) => e.start)).toEqual([480, 540, 600, 600]);

    const deskWork = entries.filter((e) => e.kind === "work" && e.typeName === "Borrowing Services Desk");
    expect(deskWork).toHaveLength(2);
    expect(entries.some((e) => e.kind === "work" && e.typeName === "Students Stacks")).toBe(true);

    const brk = entries.find((e) => e.kind === "break");
    expect(brk).toMatchObject({ start: 600, end: 615, title: "Rest break" });
  });

  it("labels a shift by its position and lists its tasks; falls back to a task name when unpositioned", () => {
    const shifts: Shift[] = [
      mk({ id: "x", locationId: "loc-desk", positionId: "pos-desk", taskIds: ["Shelving", "Dusting"], start: 480, end: 540 }),
      mk({ id: "y", locationId: "loc-desk", positionId: "unknown", taskIds: ["Open the Library"], start: 540, end: 600 }),
    ];
    const [a, b] = consolidateMyDay(shifts, resolvers);
    expect(a).toMatchObject({ title: "Desk", tasks: ["Shelving", "Dusting"] });
    expect(b).toMatchObject({ title: "Open the Library" }); // no position -> first task is the title
  });
});
