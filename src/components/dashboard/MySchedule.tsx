"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store/StoreProvider";
import { addDays } from "@/domain/time";
import { hoursLabel, timeRange } from "@/lib/ui";
import { fullDayLabel, scheduleTypeColorVar, todayISO } from "@/lib/schedule-view";
import { consolidateMyDay } from "@/lib/my-schedule";

/**
 * A single, consolidated view of the signed-in person's day: every assignment
 * across every schedule type, plus their breaks, merged into one time-ordered
 * timeline. So a desk shift, a stacks shift, and a lunch break all list together.
 */
export function MySchedule({ embedded = false }: { embedded?: boolean }) {
  const { db, currentUser } = useStore();
  const [date, setDate] = useState<string>(todayISO());

  const activeLocations = useMemo(() => db.locations.filter((l) => l.active), [db.locations]);
  const pos = (id: string) => db.positions.find((p) => p.id === id);
  const scheduleType = (locationId: string) => db.locations.find((l) => l.id === locationId);
  const taskName = (id: string) => db.tasks.find((t) => t.id === id)?.name ?? id;

  const myShifts = useMemo(
    () => db.shifts.filter((s) => s.employeeId === currentUser.id && s.status !== "cancelled"),
    [db.shifts, currentUser.id],
  );
  const dayShifts = useMemo(
    () => myShifts.filter((s) => s.date === date).sort((a, b) => a.start - b.start),
    [myShifts, date],
  );

  const entries = useMemo(
    () =>
      consolidateMyDay(dayShifts, {
        scheduleTypeName: (id) => scheduleType(id)?.name ?? "Schedule",
        positionName: (id) => pos(id)?.name,
        taskName,
        colorVar: (id) => scheduleTypeColorVar(id, activeLocations),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dayShifts, activeLocations],
  );

  const workedMinutes = dayShifts.reduce((m, s) => {
    const unpaid = s.breaks.filter((b) => !b.paid).reduce((sum, b) => sum + (b.end - b.start), 0);
    return m + (s.end - s.start) - unpaid;
  }, 0);
  const isToday = date === todayISO();

  const content = (
    <>
      <div className="spread schedule-day-nav" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
        <p className="muted" style={{ margin: 0, fontSize: "0.86rem" }}>
          {isToday ? "Today · " : ""}{fullDayLabel(date)}
          {dayShifts.length > 0 && <> · {hoursLabel(workedMinutes)} scheduled · {dayShifts.length} assignment{dayShifts.length === 1 ? "" : "s"}</>}
        </p>
        <div className="row" style={{ gap: "0.4rem" }}>
          <button type="button" className="button sm" onClick={() => setDate((d) => addDays(d, -1))} aria-label="Previous day">‹</button>
          <button type="button" className="button sm" onClick={() => setDate(todayISO())}>Today</button>
          <button type="button" className="button sm" onClick={() => setDate((d) => addDays(d, 1))} aria-label="Next day">›</button>
        </div>
      </div>

      <div className="mt">
        {entries.length === 0 ? (
          <p className="muted my-empty">
            {isToday ? "Nothing scheduled for you today." : `Nothing scheduled for ${fullDayLabel(date)}.`}
          </p>
        ) : (
          <ol className="my-timeline" aria-label={`Your assignments on ${fullDayLabel(date)}`}>
            {entries.map((e) => (
              <li key={e.key} className={`my-entry${e.kind === "break" ? " is-break" : ""}`} style={{ ["--type" as string]: e.colorVar }}>
                <div className="my-entry-time">{timeRange(e.start, e.end)}</div>
                <span className="my-entry-rail" aria-hidden />
                <div className="my-entry-body">
                  <div className="my-entry-title">{e.title}</div>
                  <div className="my-entry-meta">
                    <span className="my-type-badge">{e.typeName}</span>
                    {e.tasks.length > 0 && <span className="muted my-entry-tasks">{e.tasks.join(" · ")}</span>}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      <Link href="/schedule" className="button sm glass-button mt">Open full schedule</Link>
    </>
  );

  if (embedded) return content;

  return (
    <section className="card glass pad-lg" aria-labelledby="my-schedule-heading">
      <div className="spread" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
        <h2 id="my-schedule-heading" style={{ marginTop: 0, marginBottom: "0.15rem" }}>My schedule</h2>
      </div>
      {content}
    </section>
  );
}
