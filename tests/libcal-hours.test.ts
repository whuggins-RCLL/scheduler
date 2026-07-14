import { describe, expect, it } from "vitest";
import { normalizeLibCalJsonLd } from "../src/lib/integrations/libcal-hours";

describe("normalizeLibCalJsonLd", () => {
  it("normalizes dated opening-hours specifications", () => {
    const result = normalizeLibCalJsonLd(
      {
        name: "Borrowing Services Desk",
        openingHoursSpecification: [
          {
            "@type": "OpeningHoursSpecification",
            validFrom: "2026-07-14",
            opens: "08:00",
            closes: "18:00",
          },
        ],
      },
      "2026-07-14T00:00:00.000Z",
    );

    expect(result.intervals).toEqual([
      {
        locationId: "libcal-2457",
        locationName: "Borrowing Services Desk",
        date: "2026-07-14",
        opensAt: "08:00",
        closesAt: "18:00",
        isClosed: false,
        note: undefined,
        source: "libcal",
        sourceId: "2457",
        retrievedAt: "2026-07-14T00:00:00.000Z",
      },
    ]);
  });
});
