"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store/StoreProvider";
import { addDays } from "@/domain/time";
import { hoursLabel } from "@/lib/ui";
import { fullDayLabel, todayISO } from "@/lib/schedule-view";
import { DayTimeline } from "./DayTimeline";

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

  const empName = () => "You";
  const pos = (id: string) => db.positions.find((p) => p.id === id);
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
        <DayTimeline
          shifts={dayShifts}
          empName={empName}
          pos={pos}
          emptyLabel={isToday ? "Nothing scheduled for you today." : `Nothing scheduled for ${fullDayLabel(date)}.`}
        />
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
