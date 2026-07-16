import { describe, expect, it } from "vitest";
import { splitOpenAccessSegments, formatOperatingHoursSummary } from "../src/lib/operating-hours-display";
import { parseTime } from "../src/domain/time";
import { SLS_OPEN_ACCESS_HOURS_LABEL } from "../src/lib/config";

const T = (hhmm: string) => parseTime(hhmm);

describe("operating hours display", () => {
  it("labels the trailing 2h window as SLS Open Access Hours", () => {
    const segments = splitOpenAccessSegments([{ start: T("09:00"), end: T("17:00") }]);
    expect(segments).toEqual([
      { start: T("09:00"), end: T("15:00") },
      { start: T("15:00"), end: T("17:00"), label: SLS_OPEN_ACCESS_HOURS_LABEL },
    ]);
  });

  it("formats a summary with the open-access label", () => {
    const summary = formatOperatingHoursSummary(splitOpenAccessSegments([{ start: T("08:00"), end: T("20:00") }]));
    expect(summary).toContain("6:00 PM–8:00 PM");
    expect(summary).toContain(SLS_OPEN_ACCESS_HOURS_LABEL);
  });

  it("treats short intervals as entirely open access", () => {
    const segments = splitOpenAccessSegments([{ start: T("15:00"), end: T("17:00") }]);
    expect(segments).toEqual([
      { start: T("15:00"), end: T("17:00"), label: SLS_OPEN_ACCESS_HOURS_LABEL },
    ]);
  });
});
