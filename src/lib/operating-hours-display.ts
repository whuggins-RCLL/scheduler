import { DESK_COVERAGE_BUFFER_MINUTES, SLS_OPEN_ACCESS_HOURS_LABEL } from "@/lib/config";
import { formatTime12 } from "@/domain/time";
import type { MinuteOfDay, TimeInterval } from "@/domain/types";

export type OperatingHoursSegment = {
  start: MinuteOfDay;
  end: MinuteOfDay;
  label?: string;
};

/**
 * Split staffed intervals so the trailing desk-coverage window is labeled
 * separately (e.g. "Staffed, SLS Open Access Hours").
 */
export function splitOpenAccessSegments(
  intervals: TimeInterval[],
  bufferMinutes: number = DESK_COVERAGE_BUFFER_MINUTES,
  openAccessLabel: string = SLS_OPEN_ACCESS_HOURS_LABEL,
): OperatingHoursSegment[] {
  const segments: OperatingHoursSegment[] = [];
  for (const iv of intervals) {
    const duration = iv.end - iv.start;
    if (duration <= 0) continue;
    if (duration <= bufferMinutes) {
      segments.push({ start: iv.start, end: iv.end, label: openAccessLabel });
      continue;
    }
    segments.push({ start: iv.start, end: iv.end - bufferMinutes });
    segments.push({ start: iv.end - bufferMinutes, end: iv.end, label: openAccessLabel });
  }
  return segments;
}

/** Human-readable summary of one day's operating segments. */
export function formatOperatingHoursSummary(segments: OperatingHoursSegment[]): string {
  if (segments.length === 0) return "Closed";
  return segments
    .map((seg) => {
      const range = `${formatTime12(seg.start)}–${formatTime12(seg.end)}`;
      return seg.label ? `${range} (${seg.label})` : range;
    })
    .join(", ");
}
