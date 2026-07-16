import { describe, expect, it } from "vitest";
import { formatDisplayTime, formatDisplayTimeRange } from "../src/lib/time-format";

describe("time format preference", () => {
  it("formats standard (12-hour) times", () => {
    expect(formatDisplayTime(9 * 60, "standard")).toBe("9:00 AM");
    expect(formatDisplayTime(13 * 60 + 30, "standard")).toBe("1:30 PM");
  });

  it("formats military (24-hour) times", () => {
    expect(formatDisplayTime(9 * 60, "military")).toBe("09:00");
    expect(formatDisplayTime(13 * 60 + 30, "military")).toBe("13:30");
  });

  it("formats time ranges", () => {
    expect(formatDisplayTimeRange(9 * 60, 17 * 60, "standard")).toBe("9:00 AM – 5:00 PM");
    expect(formatDisplayTimeRange(9 * 60, 17 * 60, "military")).toBe("09:00 – 17:00");
  });
});
