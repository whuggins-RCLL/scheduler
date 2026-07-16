"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store/StoreProvider";
import { canManage } from "@/domain/scope";
import { addDays, WEEKDAY_LABELS, weekdayOf } from "@/domain/time";
import { positionColorVar, timeRange } from "@/lib/ui";
import {
  fullDayLabel,
  mondayOf,
  monthLabel,
  monthWeeks,
  shiftMonth,
  todayISO,
} from "@/lib/schedule-view";
import type { Shift } from "@/domain/types";
import { ShiftDialog } from "@/components/schedule/ShiftDialog";
import { DayTimeline } from "./DayTimeline";

type View = "day" | "week" | "month";

export function DeskScheduleBoard() {
  const { db, currentUser } = useStore();
  const manager = canManage(currentUser);
  const deskLocation = db.locations.find((l) => l.id === "loc-desk") ?? db.locations.find((l) => /desk/i.test(l.name));
  const [view, setView] = useState<View>("week");
  const [anchor, setAnchor] = useState<string>(todayISO());
  const [locationId, setLocationId] = useState<string>(deskLocation?.id ?? "");
  const [editing, setEditing] = useState<Shift | null>(null);

  const empName = (id: string | null) => (id ? db.employees.find((e) => e.id === id)?.preferredName ?? "Unknown" : "Open shift");
  const pos = (id: string) => db.positions.find((p) => p.id === id);

  const filterLocations = useMemo(() => {
    const fromPositions = new Set(
      db.positions.map((p) => p.locationId).filter((id): id is string => Boolean(id)),
    );
    return db.locations.filter((l) => fromPositions.has(l.id) || l.id === deskLocation?.id);
  }, [db.locations, db.positions, deskLocation?.id]);

  const shifts = useMemo(
    () =>
      db.shifts.filter(
        (s) => s.status !== "cancelled" && (locationId === "" || s.locationId === locationId),
      ),
    [db.shifts, locationId],
  );

  const shiftsOn = (date: string) => shifts.filter((s) => s.date === date).sort((a, b) => a.start - b.start);

  const weekDays = useMemo(() => {
    const start = mondayOf(anchor);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [anchor]);

  const step = (dir: -1 | 1) => {
    if (view === "day") setAnchor((a) => addDays(a, dir));
    else if (view === "week") setAnchor((a) => addDays(a, dir * 7));
    else setAnchor((a) => shiftMonth(a, dir));
  };

  const rangeLabel =
    view === "day" ? fullDayLabel(anchor) : view === "week" ? `Week of ${fullDayLabel(mondayOf(anchor))}` : monthLabel(anchor);

  const onSelect = manager ? (s: Shift) => setEditing(s) : undefined;

  return (
    <section className="card glass pad-lg" aria-labelledby="desk-schedule-heading">
      <div className="spread" style={{ flexWrap: "wrap", gap: "0.75rem" }}>
        <div>
          <h2 id="desk-schedule-heading" style={{ marginTop: 0, marginBottom: "0.15rem" }}>
            {deskLocation?.name ?? "Borrowing Services Desk"} schedule
          </h2>
          <p className="muted" style={{ margin: 0, fontSize: "0.86rem" }}>{rangeLabel}</p>
        </div>
        <div className="row" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
          {filterLocations.length >= 1 && (
            <label className="field" style={{ marginBottom: 0 }}>
              <span className="sr-only">Location</span>
              <select value={locationId} onChange={(e) => setLocationId(e.target.value)} aria-label="Filter schedule by location">
                <option value="">All locations</option>
                {filterLocations.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </label>
          )}
          <div className="pill-toggle" role="group" aria-label="Schedule range">
            <button aria-pressed={view === "day"} onClick={() => setView("day")}>Day</button>
            <button aria-pressed={view === "week"} onClick={() => setView("week")}>Week</button>
            <button aria-pressed={view === "month"} onClick={() => setView("month")}>Month</button>
          </div>
        </div>
      </div>

      <div className="row" style={{ margin: "0.75rem 0", gap: "0.4rem" }}>
        <button className="button sm" onClick={() => step(-1)} aria-label="Previous">‹ Prev</button>
        <button className="button sm" onClick={() => setAnchor(todayISO())}>Today</button>
        <button className="button sm" onClick={() => step(1)} aria-label="Next">Next ›</button>
      </div>

      {view === "day" && (
        <DayTimeline
          shifts={shiftsOn(anchor)}
          empName={empName}
          pos={pos}
          onSelect={onSelect}
          emptyLabel={`No shifts on ${fullDayLabel(anchor)}.`}
        />
      )}

      {view === "week" && (
        <WeekColumns
          days={weekDays}
          shiftsOn={shiftsOn}
          empName={empName}
          pos={pos}
          onSelect={onSelect}
        />
      )}

      {view === "month" && (
        <MonthGrid
          anchor={anchor}
          shiftsOn={shiftsOn}
          onPickDay={(d) => { setAnchor(d); setView("day"); }}
        />
      )}

      {editing && (
        <ShiftDialog
          shift={editing}
          scheduleId={editing.scheduleId}
          date={editing.date}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}

function WeekColumns({
  days,
  shiftsOn,
  empName,
  pos,
  onSelect,
}: {
  days: string[];
  shiftsOn: (date: string) => Shift[];
  empName: (id: string | null) => string;
  pos: (id: string) => { name: string; shortLabel: string; colorToken: string } | undefined;
  onSelect?: (shift: Shift) => void;
}) {
  const today = todayISO();
  return (
    <div className="desk-week" role="list">
      {days.map((date) => {
        const dayShifts = shiftsOn(date);
        return (
          <div className="desk-week-col" role="listitem" key={date} aria-label={fullDayLabel(date)}>
            <div className={`desk-week-head${date === today ? " is-today" : ""}`}>
              <strong>{WEEKDAY_LABELS[weekdayOf(date)]}</strong>
              <span className="muted">{date.slice(5)}</span>
            </div>
            <div className="stack" style={{ gap: "0.3rem" }}>
              {dayShifts.length === 0 && <small className="muted">—</small>}
              {dayShifts.map((s) => {
                const p = pos(s.positionId);
                const cls = `desk-chip${!s.employeeId ? " is-open" : ""}`;
                const style = { ["--pos" as string]: positionColorVar(p?.colorToken ?? "") };
                const inner = (
                  <>
                    <span className="desk-chip-time">{timeRange(s.start, s.end)}</span>
                    <span className="desk-chip-name">{empName(s.employeeId)}</span>
                    <span className="muted" style={{ fontSize: "0.72rem" }}>{p?.shortLabel ?? p?.name}</span>
                  </>
                );
                return onSelect ? (
                  <button key={s.id} className={cls} style={style} onClick={() => onSelect(s)}>{inner}</button>
                ) : (
                  <div key={s.id} className={cls} style={style}>{inner}</div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MonthGrid({
  anchor,
  shiftsOn,
  onPickDay,
}: {
  anchor: string;
  shiftsOn: (date: string) => Shift[];
  onPickDay: (date: string) => void;
}) {
  const weeks = monthWeeks(anchor);
  const month = anchor.slice(0, 7);
  const today = todayISO();
  return (
    <div className="desk-month" role="grid" aria-label={`${monthLabel(anchor)} schedule`}>
      <div className="desk-month-row desk-month-labels" role="row">
        {WEEKDAY_LABELS.map((d) => (
          <div key={d} className="desk-month-label" role="columnheader">{d}</div>
        ))}
      </div>
      {weeks.map((week) => (
        <div className="desk-month-row" role="row" key={week[0]}>
          {week.map((date) => {
            const inMonth = date.slice(0, 7) === month;
            const count = shiftsOn(date).length;
            const open = shiftsOn(date).filter((s) => !s.employeeId).length;
            return (
              <button
                key={date}
                role="gridcell"
                className={`desk-month-cell${inMonth ? "" : " is-out"}${date === today ? " is-today" : ""}`}
                onClick={() => onPickDay(date)}
                aria-label={`${fullDayLabel(date)}: ${count} shift${count === 1 ? "" : "s"}${open ? `, ${open} open` : ""}`}
              >
                <span className="desk-month-date">{Number(date.slice(8))}</span>
                {count > 0 && (
                  <span className="desk-month-count">
                    {count} shift{count === 1 ? "" : "s"}
                    {open > 0 && <span className="desk-month-open"> · {open} open</span>}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
