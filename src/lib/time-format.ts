import { formatTime, formatTime12 } from "@/domain/time";

export type TimeFormat = "standard" | "military";

export const TIME_FORMAT_KEY = "rcll.pref.timeFormat";

/** Read the saved time-format preference (defaults to standard 12-hour). */
export function getTimeFormat(): TimeFormat {
  if (typeof window === "undefined") return "standard";
  try {
    const stored = window.localStorage.getItem(TIME_FORMAT_KEY);
    return stored === "military" ? "military" : "standard";
  } catch {
    return "standard";
  }
}

export function setTimeFormat(format: TimeFormat): void {
  try {
    window.localStorage.setItem(TIME_FORMAT_KEY, format);
    document.documentElement.setAttribute("data-time-format", format);
    window.dispatchEvent(new CustomEvent("rcll:timeformat", { detail: format }));
  } catch {
    /* ignore */
  }
}

/** Format minutes-of-day using the active display preference. */
export function formatDisplayTime(minutes: number, format?: TimeFormat): string {
  const active = format ?? getTimeFormat();
  return active === "military" ? formatTime(minutes) : formatTime12(minutes);
}

/** Format a time range using the active display preference. */
export function formatDisplayTimeRange(start: number, end: number, format?: TimeFormat): string {
  return `${formatDisplayTime(start, format)} – ${formatDisplayTime(end, format)}`;
}
