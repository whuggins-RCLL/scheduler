export const dynamic = "force-dynamic";

interface CalendarEvent {
  summary: string;
  start: string;
  end: string;
  location: string;
  allDay: boolean;
}

interface ParsedDate {
  date: Date;
  allDay: boolean;
}

/**
 * Parse an ICS date/time value (params already stripped) into a Date.
 * Supports:
 *  - YYYYMMDD              → local midnight, all-day
 *  - YYYYMMDDTHHMMSSZ      → UTC instant
 *  - YYYYMMDDTHHMMSS       → local time (TZID ignored, treated as local)
 * Returns null when the value cannot be understood.
 */
function parseIcsDate(value: string): ParsedDate | null {
  const raw = value.trim();

  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(raw);
  if (dateOnly) {
    const [, y, m, d] = dateOnly;
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    if (Number.isNaN(date.getTime())) return null;
    return { date, allDay: true };
  }

  const dateTime = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(raw);
  if (dateTime) {
    const [, y, m, d, hh, mm, ss, z] = dateTime;
    const year = Number(y);
    const month = Number(m) - 1;
    const day = Number(d);
    const hour = Number(hh);
    const minute = Number(mm);
    const second = Number(ss);
    const date = z
      ? new Date(Date.UTC(year, month, day, hour, minute, second))
      : new Date(year, month, day, hour, minute, second);
    if (Number.isNaN(date.getTime())) return null;
    return { date, allDay: false };
  }

  return null;
}

/** Unfold folded ICS lines: a line starting with space/tab continues the previous line. */
function unfold(text: string): string[] {
  const rawLines = text.split(/\r\n|\r|\n/);
  const lines: string[] = [];
  for (const line of rawLines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  }
  return lines;
}

/** Split the "PROPERTY;PARAMS" name portion from the value at the first unquoted colon. */
function splitLine(line: string): { name: string; value: string } | null {
  const colon = line.indexOf(":");
  if (colon === -1) return null;
  const namePart = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const name = namePart.split(";")[0].toUpperCase();
  return { name, value };
}

function parseEvents(text: string): CalendarEvent[] {
  const lines = unfold(text);
  const events: CalendarEvent[] = [];

  let inEvent = false;
  let summary = "";
  let location = "";
  let startParsed: ParsedDate | null = null;
  let endParsed: ParsedDate | null = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      inEvent = true;
      summary = "";
      location = "";
      startParsed = null;
      endParsed = null;
      continue;
    }
    if (line === "END:VEVENT") {
      if (inEvent && startParsed) {
        const allDay = startParsed.allDay;
        const start = startParsed.date;
        const end = endParsed ? endParsed.date : start;
        events.push({
          summary: summary || "(untitled event)",
          start: start.toISOString(),
          end: end.toISOString(),
          location,
          allDay,
        });
      }
      inEvent = false;
      continue;
    }
    if (!inEvent) continue;

    const parsed = splitLine(line);
    if (!parsed) continue;

    switch (parsed.name) {
      case "SUMMARY":
        summary = parsed.value.trim();
        break;
      case "LOCATION":
        location = parsed.value.trim();
        break;
      case "DTSTART":
        startParsed = parseIcsDate(parsed.value);
        break;
      case "DTEND":
        endParsed = parseIcsDate(parsed.value);
        break;
      default:
        break;
    }
  }

  return events;
}

export async function GET() {
  const url = process.env.GOOGLE_CALENDAR_ICAL_URL;

  if (!url) {
    return Response.json({
      configured: false,
      events: [],
      warnings: ["No iCal feed configured. Set GOOGLE_CALENDAR_ICAL_URL."],
    });
  }

  let text: string;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      return Response.json({
        configured: true,
        events: [],
        warnings: ["Could not reach the calendar feed."],
      });
    }
    text = await res.text();
  } catch {
    return Response.json({
      configured: true,
      events: [],
      warnings: ["Could not reach the calendar feed."],
    });
  }

  try {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const cutoff = startOfToday.getTime();
    const upcoming = parseEvents(text)
      .filter((event) => {
        const endMs = new Date(event.end).getTime();
        const startMs = new Date(event.start).getTime();
        const latest = Number.isNaN(endMs) ? startMs : Math.max(startMs, endMs);
        return !Number.isNaN(latest) && latest >= cutoff;
      })
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
      .slice(0, 50);

    return Response.json({ configured: true, events: upcoming, warnings: [] });
  } catch {
    return Response.json({
      configured: true,
      events: [],
      warnings: ["Could not read the calendar feed."],
    });
  }
}
