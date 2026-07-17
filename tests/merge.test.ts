import { describe, expect, it } from "vitest";
import { unionById } from "../src/lib/store/merge";

type Row = { id: string; name: string; active?: boolean };

describe("unionById (Firestore snapshot merge)", () => {
  const seed: Row[] = [
    { id: "loc-main", name: "Main Library" },
    { id: "loc-desk", name: "Borrowing Services Desk" },
    { id: "loc-stacks", name: "Stacks" },
    { id: "loc-breaks", name: "Breaks & Lunches" },
  ];

  it("keeps seeded defaults when Firestore only returns a subset (the 'only Main' bug)", () => {
    const fromFirestore: Row[] = [{ id: "loc-main", name: "Main Library" }];
    const merged = unionById(seed, fromFirestore);
    expect(merged.map((r) => r.id).sort()).toEqual(["loc-breaks", "loc-desk", "loc-main", "loc-stacks"]);
  });

  it("lets Firestore edits win by id (rename / deactivate persists)", () => {
    const fromFirestore: Row[] = [{ id: "loc-stacks", name: "Stacks & Shelving", active: false }];
    const merged = unionById(seed, fromFirestore);
    const stacks = merged.find((r) => r.id === "loc-stacks")!;
    expect(stacks.name).toBe("Stacks & Shelving");
    expect(stacks.active).toBe(false);
  });

  it("includes Firestore-only records (admin-added types)", () => {
    const fromFirestore: Row[] = [{ id: "loc-events", name: "Special Events" }];
    const merged = unionById(seed, fromFirestore);
    expect(merged.some((r) => r.id === "loc-events")).toBe(true);
    expect(merged.length).toBe(seed.length + 1);
  });

  it("does not wipe local records on an empty snapshot", () => {
    const local: Row[] = [{ id: "pos-ref", name: "Reference Desk" }];
    expect(unionById(local, [])).toEqual(local);
  });
});
