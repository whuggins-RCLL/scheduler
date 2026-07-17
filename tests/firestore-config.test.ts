import { describe, expect, it } from "vitest";
import { mergeLocationsWithSeed, missingSeedLocations } from "../src/lib/store/firestore-config";
import { seedLocations } from "../src/lib/store/seed";
import type { Location } from "../src/domain/types";

describe("firestore-config schedule type sync", () => {
  it("fills missing seed schedule types when Firestore is partial", () => {
    const mainOnly = seedLocations().filter((location) => location.id === "loc-main");
    const merged = mergeLocationsWithSeed(mainOnly);
    expect(merged.map((location) => location.id)).toEqual([
      "loc-main",
      "loc-desk",
      "loc-stacks",
      "loc-breaks",
    ]);
    expect(merged[0].name).toBe("Main Library");
  });

  it("keeps Firestore values authoritative for seed ids", () => {
    const renamedMain: Location = {
      ...seedLocations()[0],
      name: "Renamed Main",
      shortName: "Renamed",
    };
    const merged = mergeLocationsWithSeed([renamedMain]);
    expect(merged.find((location) => location.id === "loc-main")?.name).toBe("Renamed Main");
    expect(merged).toHaveLength(4);
  });

  it("appends custom schedule types after the seed set", () => {
    const custom: Location = {
      id: "loc-events",
      name: "Special Events",
      shortName: "Events",
      timeZone: "America/Los_Angeles",
      minStaffing: 0,
      openBufferMinutes: 0,
      closeBufferMinutes: 0,
      active: true,
    };
    const merged = mergeLocationsWithSeed([...seedLocations(), custom]);
    expect(merged.map((location) => location.id)).toEqual([
      "loc-main",
      "loc-desk",
      "loc-stacks",
      "loc-breaks",
      "loc-events",
    ]);
  });

  it("lists seed schedule types missing from Firestore", () => {
    const mainOnly = seedLocations().filter((location) => location.id === "loc-main");
    const missing = missingSeedLocations(mainOnly);
    expect(missing.map((location) => location.id)).toEqual([
      "loc-desk",
      "loc-stacks",
      "loc-breaks",
    ]);
  });
});
