"use client";

import { useMemo } from "react";
import { useStore } from "@/lib/store/StoreProvider";
import { WORKING_WEEKDAYS } from "@/domain/working-hours";
import { formatTime } from "@/domain/time";
import { humanDate } from "@/lib/ui";

/**
 * Read-only view of a student worker's final quarter working-hours schedule,
 * set by managers. Students cannot edit this — only view it.
 */
export function StudentQuarterScheduleView({ employeeId }: { employeeId: string }) {
  const { db } = useStore();
  const employee = db.employees.find((e) => e.id === employeeId);
  const pattern = useMemo(
    () => db.workingHours.find((p) => p.employeeId === employeeId),
    [db.workingHours, employeeId],
  );

  if (!employee) return null;

  const days = pattern?.days ?? [];

  return (
    <section className="card" aria-labelledby="quarter-schedule-heading">
      <h2 id="quarter-schedule-heading">My quarter schedule</h2>
      <p className="muted" style={{ fontSize: "0.88rem" }}>
        Your final working hours for the quarter, set by your manager. This schedule is view-only.
        Use the desk availability grid below to indicate when you can cover the borrowing desk.
      </p>

      {(pattern?.effectiveStart || pattern?.label) && (
        <p className="muted" style={{ fontSize: "0.85rem", marginBottom: "1rem" }}>
          {pattern.label && <><strong>{pattern.label}</strong> · </>}
          {pattern.effectiveStart && (
            <>
              Effective {humanDate(pattern.effectiveStart)}
              {pattern.effectiveEnd ? ` through ${humanDate(pattern.effectiveEnd)}` : ""}
            </>
          )}
        </p>
      )}

      {!pattern ? (
        <p className="muted">Your manager has not published a quarter schedule yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="data working-hours-table">
            <thead>
              <tr>
                <th scope="col">Day</th>
                <th scope="col">Hours</th>
              </tr>
            </thead>
            <tbody>
              {WORKING_WEEKDAYS.map(({ weekday, label }) => {
                const row = days.find((d) => d.weekday === weekday);
                const off = !row || row.regularDayOff;
                return (
                  <tr key={weekday}>
                    <th scope="row">{label}</th>
                    <td>
                      {off ? (
                        <span className="muted">Off</span>
                      ) : (
                        <span>{formatTime(row.start ?? 0)} – {formatTime(row.end ?? 0)}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pattern?.note && (
        <p className="muted mt" style={{ fontSize: "0.85rem" }}>
          <strong>Note from manager:</strong> {pattern.note}
        </p>
      )}
    </section>
  );
}
