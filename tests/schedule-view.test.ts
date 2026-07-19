import { describe, expect, it } from "vitest";
import { packLanes } from "../src/lib/schedule-view";

interface Iv {
  id: string;
  start: number;
  end: number;
}

const lanesUsed = (items: Iv[]) => {
  const placements = packLanes(items, (i) => i.start, (i) => i.end);
  return placements.reduce((m, p) => Math.max(m, p.lanes), items.length ? 1 : 0);
};

describe("packLanes — concurrency-driven columns", () => {
  it("stays a single column when nothing overlaps across the whole day", () => {
    const day: Iv[] = [
      { id: "a", start: 480, end: 540 }, // 8–9
      { id: "b", start: 540, end: 600 }, // 9–10
      { id: "c", start: 600, end: 660 }, // 10–11
    ];
    expect(lanesUsed(day)).toBe(1);
    // Each item spans the full width (lane 0 of 1).
    for (const p of packLanes(day, (i) => i.start, (i) => i.end)) {
      expect(p).toMatchObject({ lane: 0, lanes: 1 });
    }
  });

  it("grows a second column only for the window where two items overlap", () => {
    const day: Iv[] = [
      { id: "a", start: 480, end: 540 }, // 8–9, alone
      { id: "b", start: 600, end: 660 }, // 10–11, overlaps c
      { id: "c", start: 600, end: 720 }, // 10–12, overlaps b
      { id: "d", start: 780, end: 840 }, // 1–2, alone
    ];
    const placements = packLanes(day, (i) => i.start, (i) => i.end);
    const by = (id: string) => placements.find((p) => p.item.id === id)!;

    // Lone items keep a single lane; the overlapping pair splits into two.
    expect(by("a")).toMatchObject({ lanes: 1 });
    expect(by("d")).toMatchObject({ lanes: 1 });
    expect(by("b").lanes).toBe(2);
    expect(by("c").lanes).toBe(2);
    expect(new Set([by("b").lane, by("c").lane])).toEqual(new Set([0, 1]));
  });

  it("adds a third column when three items share an hour", () => {
    const day: Iv[] = [
      { id: "a", start: 600, end: 660 },
      { id: "b", start: 600, end: 660 },
      { id: "c", start: 600, end: 660 },
    ];
    expect(lanesUsed(day)).toBe(3);
  });
});
