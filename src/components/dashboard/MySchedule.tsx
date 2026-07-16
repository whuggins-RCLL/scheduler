"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store/StoreProvider";
import { addDays } from "@/domain/time";
import { hoursLabel, timeRange } from "@/lib/ui";
import { fullDayLabel, todayISO } from "@/lib/schedule-view";

export function MySchedule({ embedded = false }: { embedded?: boolean }) {
  const { db, currentUser } = useStore();
  const [date, setDate] = useState<string>(todayISO());

  const myShifts = useMemo(
    () => db.shifts.filter((s) => s.employeeId === currentUser.id && s.status !== "cancelled"),
    [db.shifts, currentUser.id],
  );
  const dayShifts = myShifts.filter((s) => s.date === date).sort((a, b) => a.start - b.start);
  const workedMinutes = dayShifts.reduce((m, s) => {
    const unpaid = s.breaks.filter((b) => !b.paid).reduce((sum, b) => sum + (b.end - b.start), 0);
    return m + (s.end - s.start) - unpaid;
  }, 0);

  const pos = (id: string) => db.positions.find((p) => p.id === id);
  const scheduleType = (locationId: string) => db.locations.find((l) => l.id === locationId);
  const taskName = (id: string) => db.tasks.find((t) => t.id === id)?.name ?? id;
  const isToday = date === todayISO();

  const content = (
    <>
      <div className="spread schedule-day-nav" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
        <p className="muted" style={{ margin: 0, fontSize: "0.86rem" }}>
          {isToday ? "Today · " : ""}{fullDayLabel(date)}
          {dayShifts.length > 0 && <> · {hoursLabel(workedMinutes)} scheduled</>}
        </p>
        <div className="row" style={{ gap: "0.4rem" }}>
          <button type="button" className="button sm" onClick={() => setDate((d) => addDays(d, -1))} aria-label="Previous day">‹</button>
          <button type="button" className="button sm" onClick={() => setDate(todayISO())}>Today</button>
          <button type="button" className="button sm" onClick={() => setDate((d) => addDays(d, 1))} aria-label="Next day">›</button>
        </div>
      </div>

      <div className="mt">
        {dayShifts.length === 0 ? (
          <p className="muted">
            {isToday ? "Nothing scheduled for you today." : `Nothing scheduled for ${fullDayLabel(date)}.`}
          </p>
        ) : (
          <div className="table-wrap">
            <table className="data my-schedule-table">
              <caption className="sr-only">Your shifts on {fullDayLabel(date)} across all schedule types</caption>
              <thead>
                <tr>
                  <th scope="col">Time</th>
                  <th scope="col">Schedule</th>
                  <th scope="col">Position</th>
                  <th scope="col">Tasks</th>
                </tr>
              </thead>
              <tbody>
                {dayShifts.map((s) => {
                  const p = pos(s.positionId);
                  const type = scheduleType(s.locationId);
                  return (
                    <tr key={s.id}>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {timeRange(s.start, s.end)}
                        {s.breaks.length > 0 && (
                          <div className="muted" style={{ fontSize: "0.78rem" }}>
                            {s.breaks.map((b) => `${b.kind} ${timeRange(b.start, b.end)}`).join(", ")}
                          </div>
                        )}
                      </td>
                      <td>{type?.name ?? "—"}</td>
                      <td>{p?.name ?? "—"}</td>
                      <td>
                        {s.taskIds.length === 0 ? (
                          <span className="muted">—</span>
                        ) : (
                          <div className="row" style={{ flexWrap: "wrap", gap: "0.25rem" }}>
                            {s.taskIds.map((t) => (
                              <span key={t} className="chip">{taskName(t)}</span>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
