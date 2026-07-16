"use client";

import { useMemo } from "react";
import { useStore } from "@/lib/store/StoreProvider";
import { canViewStudentAvailability } from "@/domain/scope";
import { WEEKDAY_LABELS, formatTime } from "@/domain/time";
import { GRID_SLOTS } from "@/lib/schedule-view";
import type { AvailabilityKind, AvailabilityPattern } from "@/domain/types";

/** Availability kind for one student at a weekday/slot, or null when unavailable. */
function kindAt(pattern: AvailabilityPattern | undefined, weekday: number, slot: number): AvailabilityKind | null {
  if (!pattern) return null;
  for (const b of pattern.blocks) {
    if (b.weekday === weekday && slot >= b.start && slot < b.end && b.kind !== "unavailable") return b.kind;
  }
  return null;
}

export function StudentAvailabilityGrid({ embedded = false }: { embedded?: boolean }) {
  const { db, currentUser } = useStore();
  const myProfile = db.employees.find((e) => e.id === currentUser.id);

  const students = useMemo(
    () => db.employees.filter((e) => e.active && e.classification === "student_worker"),
    [db.employees],
  );
  const patternFor = (id: string) => db.availability.find((p) => p.employeeId === id);

  // Gate: student workers and view-only accounts never see this grid.
  if (!canViewStudentAvailability(currentUser, myProfile?.classification)) return null;

  if (students.length === 0) {
    const empty = (
      <p className="muted" style={{ margin: embedded ? "0.75rem 0 0" : undefined }}>
        No student workers are set up yet.
      </p>
    );
    if (embedded) return empty;
    return (
      <section className="card glass" aria-labelledby="stu-avail-heading">
        <h2 id="stu-avail-heading" style={{ marginTop: 0 }}>Student availability</h2>
        {empty}
      </section>
    );
  }

  const content = (
    <>
      {!embedded && (
        <div className="spread" style={{ flexWrap: "wrap", gap: "0.4rem" }}>
          <h2 id="stu-avail-heading" style={{ marginTop: 0 }}>Student availability</h2>
          <span className="badge info">{students.length} student{students.length === 1 ? "" : "s"}</span>
        </div>
      )}
      <p className="muted" style={{ margin: embedded ? "0.75rem 0" : "0 0 0.75rem", fontSize: "0.86rem" }}>
        Half-hour counts show how many students can work; hover a cell for names.
      </p>

      <div className="row" style={{ marginBottom: "0.6rem", flexWrap: "wrap", gap: "0.35rem" }}>
        <span className="chip" style={{ background: "color-mix(in srgb, var(--palo-alto) 22%, var(--surface))" }}>★ preferred time</span>
        <span className="chip">{students.length} student{students.length === 1 ? "" : "s"} tracked</span>
      </div>

      <div style={{ overflowX: "auto" }}>
        <div className="stu-grid" role="grid" aria-label="Combined student availability">
          <div className="avail-head" role="columnheader">Time</div>
          {WEEKDAY_LABELS.map((d) => (
            <div className="avail-head" role="columnheader" key={d}>{d}</div>
          ))}
          {GRID_SLOTS.map((slot) => {
            const onHour = slot % 60 === 0;
            return (
              <div key={slot} style={{ display: "contents" }}>
                <div className={`avail-rowlabel${onHour ? "" : " half"}`} role="rowheader">{formatTime(slot)}</div>
                {WEEKDAY_LABELS.map((_, day) => {
                  const avail = students.filter((s) => kindAt(patternFor(s.id), day, slot) !== null);
                  const preferred = students.filter((s) => kindAt(patternFor(s.id), day, slot) === "preferred");
                  const count = avail.length;
                  const fraction = students.length ? count / students.length : 0;
                  const names = avail.map((s) => s.preferredName ?? s.legalName).join(", ");
                  return (
                    <div
                      key={`${day}-${slot}`}
                      role="gridcell"
                      className={`stu-cell${onHour ? "" : " half"}${count ? " has" : ""}`}
                      style={count ? { background: `color-mix(in srgb, var(--palo-alto) ${Math.round(12 + fraction * 55)}%, var(--surface))` } : undefined}
                      title={count ? `${WEEKDAY_LABELS[day]} ${formatTime(slot)}: ${names}` : undefined}
                      aria-label={`${WEEKDAY_LABELS[day]} ${formatTime(slot)}: ${count} student${count === 1 ? "" : "s"} available${preferred.length ? `, ${preferred.length} prefer this time` : ""}`}
                    >
                      {count > 0 && (
                        <span>
                          {count}
                          {preferred.length > 0 && <span aria-hidden style={{ color: "var(--palo-alto)" }}>★</span>}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      <div className="table-wrap mt">
        <table className="data">
          <caption className="muted" style={{ padding: "0.4rem", textAlign: "left" }}>
            Student roster with meal-break preference (accessible summary of the grid above).
          </caption>
          <thead>
            <tr>
              <th scope="col">Student</th>
              <th scope="col">Meal break</th>
              <th scope="col">Availability on file</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => {
              const pattern = patternFor(s.id);
              const hasBlocks = (pattern?.blocks.length ?? 0) > 0;
              const meal = pattern?.mealBreakMinutes;
              return (
                <tr key={s.id}>
                  <td>{s.preferredName ?? s.legalName}</td>
                  <td>{meal === 30 ? "30 min" : meal === 60 ? "1 hour" : <span className="muted">Not set</span>}</td>
                  <td>{hasBlocks ? <span className="badge ok">Submitted</span> : <span className="badge warn">None yet</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );

  if (embedded) return content;

  return (
    <section className="card glass pad-lg" aria-labelledby="stu-avail-heading">
      {content}
    </section>
  );
}
