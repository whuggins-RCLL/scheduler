import { describe, expect, it } from "vitest";
import { deskCoverageInterval } from "../src/lib/integrations/libcal-hours";
import type { OperationalHoursInterval } from "../src/lib/integrations/hours";

const staffed = (opens: string | null, closes: string | null): OperationalHoursInterval => ({
  locationId: "libcal-2457",
  locationName: "Library - (staffed)",
  date: "2026-07-13",
  opensAt: opens,
  closesAt: closes,
  isClosed: !opens || !closes,
  source: "libcal",
  sourceId: "2457",
  retrievedAt: "2026-07-13T00:00:00Z",
});

describe("desk coverage +2h rule", () => {
  it("extends the staffed close by 2 hours (3:00pm library -> 5:00pm desk)", () => {
    const desk = deskCoverageInterval(staffed("09:00", "15:00"));
    expect(desk.opensAt).toBe("09:00");
    expect(desk.closesAt).toBe("17:00");
    expect(desk.note).toMatch(/2h past library close/);
  });

  it("tolerates HH:MM:SS values from the feed", () => {
    const desk = deskCoverageInterval(staffed("08:00", "18:00:00"));
    expect(desk.closesAt).toBe("20:00");
  });

  it("honors a custom buffer", () => {
    const desk = deskCoverageInterval(staffed("09:00", "15:00"), 60);
    expect(desk.closesAt).toBe("16:00");
  });

  it("caps at end of day and leaves closed days closed", () => {
    expect(deskCoverageInterval(staffed("22:30", "23:30")).closesAt).toBe("23:59");
    expect(deskCoverageInterval(staffed(null, null)).isClosed).toBe(true);
  });
});
