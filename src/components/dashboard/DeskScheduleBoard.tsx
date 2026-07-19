"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store/StoreProvider";
import { canManage } from "@/domain/scope";
import { addDays } from "@/domain/time";
import {
  fullDayLabel,
  todayISO,
} from "@/lib/schedule-view";
import type { Shift } from "@/domain/types";
import { ShiftDialog } from "@/components/schedule/ShiftDialog";
import { ConcurrencyScheduleBoard } from "./ConcurrencyScheduleBoard";
import { DayTimeline } from "./DayTimeline";

type DeskView = "timeline" | "board";

export function DeskScheduleBoard({
  embedded = false,
  fixedLocationId,
}: {
  embedded?: boolean;
  /** When set, the board is locked to this schedule type and hides the selector. */
  fixedLocationId?: string;
}) {
  const { db, currentUser } = useStore();
  const manager = canManage(currentUser);
  const deskLocation = db.locations.find((l) => l.id === "loc-desk") ?? db.locations.find((l) => /desk/i.test(l.name));
  const [date, setDate] = useState<string>(todayISO());
  const [locationId, setLocationId] = useState<string>(fixedLocationId ?? deskLocation?.id ?? "");
  const [deskView, setDeskView] = useState<DeskView>("board");
  const [editing, setEditing] = useState<Shift | null>(null);

  const empName = (id: string | null) => (id ? db.employees.find((e) => e.id === id)?.preferredName ?? "Unknown" : "Open shift");
  const pos = (id: string) => db.positions.find((p) => p.id === id);

  // Every active schedule type is its own selectable board (desk, stacks,
  // breaks, special events, …).
  const filterLocations = useMemo(
    () => db.locations.filter((l) => l.active),
    [db.locations],
  );

  const shifts = useMemo(
    () =>
      db.shifts.filter(
        (s) => s.status !== "cancelled" && (locationId === "" || s.locationId === locationId),
      ),
    [db.shifts, locationId],
  );

  const dayShifts = shifts.filter((s) => s.date === date).sort((a, b) => a.start - b.start);
  const isToday = date === todayISO();
  const onSelect = manager ? (s: Shift) => setEditing(s) : undefined;
  const locationLabel = locationId
    ? filterLocations.find((l) => l.id === locationId)?.name
    : "All locations";

  const content = (
    <>
      <div className="spread schedule-day-nav" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
        <p className="muted" style={{ margin: 0, fontSize: "0.86rem" }}>
          {isToday ? "Today · " : ""}{fullDayLabel(date)}
          {dayShifts.length > 0 && <> · {dayShifts.length} shift{dayShifts.length === 1 ? "" : "s"}</>}
          {!fixedLocationId && locationLabel && <> · {locationLabel}</>}
        </p>
        <div className="row" style={{ gap: "0.4rem", flexWrap: "wrap" }}>
          <div className="pill-toggle" role="group" aria-label="Desk view mode">
            <button type="button" aria-pressed={deskView === "board"} onClick={() => setDeskView("board")}>Schedule</button>
            <button type="button" aria-pressed={deskView === "timeline"} onClick={() => setDeskView("timeline")}>Timeline</button>
          </div>
          {!fixedLocationId && filterLocations.length >= 1 && (
            <label className="field" style={{ marginBottom: 0 }}>
              <span className="sr-only">Location</span>
              <select
                className="button sm"
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                aria-label="Filter schedule by location"
              >
                <option value="">All locations</option>
                {filterLocations.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </label>
          )}
          <button type="button" className="button sm" onClick={() => setDate((d) => addDays(d, -1))} aria-label="Previous day">‹</button>
          <button type="button" className="button sm" onClick={() => setDate(todayISO())}>Today</button>
          <button type="button" className="button sm" onClick={() => setDate((d) => addDays(d, 1))} aria-label="Next day">›</button>
        </div>
      </div>

      <div className="mt">
        {deskView === "board" ? (
          <ConcurrencyScheduleBoard
            date={date}
            shifts={shifts}
            scheduleTypeId={locationId || undefined}
            onSelectShift={onSelect}
            emptyLabel={isToday ? "No shifts scheduled today." : `No shifts on ${fullDayLabel(date)}.`}
          />
        ) : (
          <DayTimeline
            shifts={dayShifts}
            empName={empName}
            pos={pos}
            onSelect={onSelect}
            emptyLabel={isToday ? "No desk shifts scheduled today." : `No shifts on ${fullDayLabel(date)}.`}
          />
        )}
      </div>

      {editing && (
        <ShiftDialog
          shift={editing}
          scheduleId={editing.scheduleId}
          date={editing.date}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );

  if (embedded) return content;

  return (
    <section className="card glass pad-lg" aria-labelledby="desk-schedule-heading">
      <h2 id="desk-schedule-heading" style={{ marginTop: 0, marginBottom: "0.15rem" }}>
        {deskLocation?.name ?? "Borrowing Services Desk"} schedule
      </h2>
      {content}
    </section>
  );
}
