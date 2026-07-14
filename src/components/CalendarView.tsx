"use client";

import { useEffect, useState } from "react";
import { CalendarEmbed } from "@/components/CalendarEmbed";

interface CalendarEvent {
  summary: string;
  start: string;
  end: string;
  location: string;
  allDay: boolean;
}

interface CalendarFeed {
  configured: boolean;
  events: CalendarEvent[];
  warnings: string[];
}

interface FeedState extends CalendarFeed {
  loading: boolean;
}

function isCalendarEvent(value: unknown): value is CalendarEvent {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.summary === "string" &&
    typeof v.start === "string" &&
    typeof v.end === "string" &&
    typeof v.location === "string" &&
    typeof v.allDay === "boolean"
  );
}

function parseFeed(value: unknown): CalendarFeed {
  const v = (typeof value === "object" && value !== null ? value : {}) as Record<string, unknown>;
  const events = Array.isArray(v.events) ? v.events.filter(isCalendarEvent) : [];
  const warnings = Array.isArray(v.warnings)
    ? v.warnings.filter((w): w is string => typeof w === "string")
    : [];
  return {
    configured: v.configured === true,
    events,
    warnings,
  };
}

function formatWhen(event: CalendarEvent): string {
  const start = new Date(event.start);
  if (Number.isNaN(start.getTime())) return "—";
  if (event.allDay) {
    return start.toLocaleDateString(undefined, {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }
  return start.toLocaleString();
}

export function CalendarView() {
  const [state, setState] = useState<FeedState>({
    configured: false,
    events: [],
    warnings: [],
    loading: true,
  });

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const res = await fetch("/api/integrations/calendar/ics");
        const json: unknown = await res.json();
        const feed = parseFeed(json);
        if (active) setState({ ...feed, loading: false });
      } catch {
        if (active) {
          setState({
            configured: true,
            events: [],
            warnings: ["Could not load the calendar feed."],
            loading: false,
          });
        }
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  const { configured, events, warnings, loading } = state;

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Library calendar</h1>
        <p className="muted">
          The shared Google operations calendar for the library. Events published here are visible to
          the whole team.
        </p>
      </div>

      <section className="card" aria-labelledby="calendar-embed-heading">
        <h2 id="calendar-embed-heading">Calendar</h2>
        <CalendarEmbed />
      </section>

      <section className="card" aria-labelledby="upcoming-events-heading">
        <h2 id="upcoming-events-heading">Upcoming events</h2>

        {loading && (
          <p className="muted" role="status" aria-busy="true">
            Loading calendar feed…
          </p>
        )}

        {!loading && warnings.length > 0 && (
          <p role="status" className="mt">
            <span className="badge warn">Notice</span> {warnings.join(" ")}
          </p>
        )}

        {!loading && !configured && (
          <div className="empty-state">
            The secret iCal feed is not configured, so upcoming events cannot be listed here. An admin
            can add <code>GOOGLE_CALENDAR_ICAL_URL</code> in the Vercel project settings to enable this
            list. The embedded calendar above still works.
          </div>
        )}

        {!loading && configured && events.length === 0 && (
          <div className="empty-state">No upcoming events.</div>
        )}

        {!loading && configured && events.length > 0 && (
          <div className="table-wrap">
            <table className="data">
              <caption>Upcoming events from the shared library operations calendar.</caption>
              <thead>
                <tr>
                  <th scope="col">Event</th>
                  <th scope="col">When</th>
                  <th scope="col">Location</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event, index) => (
                  <tr key={`${event.start}-${index}`}>
                    <td>{event.summary}</td>
                    <td>
                      {formatWhen(event)}
                      {event.allDay && (
                        <>
                          {" "}
                          <span className="chip">All day</span>
                        </>
                      )}
                    </td>
                    <td>{event.location || <span className="muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
