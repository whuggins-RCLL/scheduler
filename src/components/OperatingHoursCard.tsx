"use client";

import { useStore } from "@/lib/store/StoreProvider";
import { formatTime12, WEEKDAY_LABELS, weekdayOf } from "@/domain/time";

const LONG_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Compact operating-hours embed for the dashboard, today highlighted. */
export function OperatingHoursCard() {
  const { db } = useStore();
  const hours = db.operatingHours.find((o) => o.locationId === "loc-main") ?? db.operatingHours[0];
  const location = hours ? db.locations.find((l) => l.id === hours.locationId) : undefined;
  const today = todayISO();
  const todayIdx = weekdayOf(today);
  const todayException = hours?.exceptions.find((e) => e.date === today);

  if (!hours) {
    return (
      <section className="card glass" aria-labelledby="op-hours">
        <h2 id="op-hours">Operating hours</h2>
        <p className="muted">No operating hours configured.</p>
      </section>
    );
  }

  const renderIntervals = (idx: number) => {
    const intervals = hours.weekly[idx] ?? [];
    if (intervals.length === 0) return <span className="closed">Closed</span>;
    return intervals.map((iv, i) => (
      <span key={i} className="val">
        {i > 0 ? ", " : ""}
        {formatTime12(iv.start)}–{formatTime12(iv.end)}
      </span>
    ));
  };

  return (
    <section className="card glass" aria-labelledby="op-hours">
      <div className="spread" style={{ marginBottom: "0.5rem" }}>
        <h2 id="op-hours" style={{ margin: 0 }}>Operating hours</h2>
        {location && <span className="badge">{location.shortName}</span>}
      </div>
      <div className="hours-list">
        {WEEKDAY_LABELS.map((_, idx) => (
          <div key={idx} className={`hours-row${idx === todayIdx ? " today" : ""}`}>
            <span className="day">{LONG_DAYS[idx]}{idx === todayIdx ? " · Today" : ""}</span>
            <span>{renderIntervals(idx)}</span>
          </div>
        ))}
      </div>
      {todayException && (
        <p className="muted" style={{ marginTop: "0.6rem", fontSize: "0.82rem" }}>
          Today: {todayException.closed
            ? "Closed (exception)"
            : todayException.intervals.map((iv) => `${formatTime12(iv.start)}–${formatTime12(iv.end)}`).join(", ")}
          {todayException.reason ? ` — ${todayException.reason}` : ""}
        </p>
      )}
    </section>
  );
}
