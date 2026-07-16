"use client";

import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store/StoreProvider";
import { humanDate, timeRange } from "@/lib/ui";
import { eligibleRecipients } from "@/domain/swaps";
import { isStudentWorker } from "@/domain/scope";
import { defaultCaliforniaPolicy } from "@/domain/compliance";
import { DEFAULT_TIMEZONE } from "@/lib/config";
import { nowMinutesInTimeZone } from "@/domain/time";
import { todayISO } from "@/lib/schedule-view";
import { visibleCoverageRequests } from "@/domain/desk-coverage";
import type { AvailabilityPattern, LeaveRecord, Shift } from "@/domain/types";

export function SwapsView() {
  const { db, currentUser, requestSwap, acceptCoverage, declineCoverage, expireStaleCoverage } = useStore();
  const today = todayISO();

  useEffect(() => {
    expireStaleCoverage({ date: today, minute: nowMinutesInTimeZone(DEFAULT_TIMEZONE) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today]);

  const coverageRequests = useMemo(
    () => visibleCoverageRequests(db.swaps, db.shifts, currentUser.id, { date: today, minute: nowMinutesInTimeZone(DEFAULT_TIMEZONE) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db.swaps, db.shifts, currentUser.id, today],
  );
  const [selectedShift, setSelectedShift] = useState<string>("");
  const [outcome, setOutcome] = useState<{ status: string; reasons: string[] } | null>(null);

  const myShifts = useMemo(
    () => db.shifts.filter((s) => s.employeeId === currentUser.id && s.status !== "cancelled" && !s.locked),
    [db.shifts, currentUser.id],
  );
  const openShifts = db.shifts.filter((s) => !s.employeeId && s.status !== "cancelled");

  const empName = (id: string | null) => (id ? db.employees.find((e) => e.id === id)?.preferredName ?? id : "Open");
  const pos = (id: string) => db.positions.find((p) => p.id === id);

  const myEmployee = db.employees.find((e) => e.id === currentUser.id);
  const initiatorClassification = myEmployee?.classification ?? "other";

  // Eligible recipients for the selected shift (never lists unavailable staff).
  const eligible = useMemo(() => {
    const shift = db.shifts.find((s) => s.id === selectedShift);
    const position = shift && pos(shift.positionId);
    if (!shift || !position) return [];
    const patterns: Record<string, AvailabilityPattern[]> = {};
    const leave: Record<string, LeaveRecord[]> = {};
    const shiftsByEmployeeDay: Record<string, Shift[]> = {};
    const weeklyMinutes: Record<string, number> = {};
    for (const e of db.employees) {
      patterns[e.id] = db.availability.filter((p) => p.employeeId === e.id);
      leave[e.id] = db.leave.filter((l) => l.employeeId === e.id);
      shiftsByEmployeeDay[`${e.id}:${shift.date}`] = db.shifts.filter((s) => s.employeeId === e.id && s.date === shift.date);
      weeklyMinutes[e.id] = db.shifts.filter((s) => s.employeeId === e.id && s.status !== "cancelled").reduce((m, s) => m + (s.end - s.start), 0);
    }
    return eligibleRecipients(shift, position, initiatorClassification, db.employees.filter((e) => e.active), {
      patterns, leave, leaveTypes: db.leaveTypes, shiftsByEmployeeDay,
      policy: defaultCaliforniaPolicy("non_exempt_staff"), positions: db.positions, weeklyMinutes,
    });
  }, [db, selectedShift, initiatorClassification]);

  function offer(toEmployeeId: string) {
    const res = requestSwap({ shiftId: selectedShift, toEmployeeId });
    setOutcome({ status: res.status, reasons: res.reasons });
  }

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Shift swaps &amp; open shifts</h1>
        <p className="muted">
          Offer an eligible shift to a coworker. Swaps auto-approve only when the recipient is available,
          qualified, and every policy gate passes — otherwise they route to a manager for review.
          {isStudentWorker(initiatorClassification) && " Student workers may only swap with other students."}
        </p>
      </div>

      {coverageRequests.length > 0 && (
        <section className="card">
          <h2>Teammates need coverage</h2>
          <p className="muted" style={{ fontSize: "0.88rem" }}>
            Pick up a desk shift a coworker can&apos;t cover, or mark that you can&apos;t help.
          </p>
          <ul className="list-reset stack" style={{ gap: "0.5rem" }}>
            {coverageRequests.map(({ swap, shift }) => (
              <li key={swap.id} className="spread" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
                <span>
                  <strong>{empName(swap.fromEmployeeId)}</strong> · {humanDate(shift.date)} {timeRange(shift.start, shift.end)} · {pos(shift.positionId)?.name}
                </span>
                <span className="row" style={{ gap: "0.35rem" }}>
                  <button className="button sm primary" onClick={() => acceptCoverage(swap.id)}>Cover this shift</button>
                  <button className="button sm" onClick={() => declineCoverage(swap.id)}>Can&apos;t help</button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid-2">
        <section className="card">
          <h2>Offer one of my shifts</h2>
          {myShifts.length === 0 ? (
            <p className="muted">You have no swappable (unlocked) shifts.</p>
          ) : (
            <>
              <div className="field">
                <label htmlFor="swap-shift">Shift to give up</label>
                <select id="swap-shift" value={selectedShift} onChange={(e) => { setSelectedShift(e.target.value); setOutcome(null); }}>
                  <option value="">Select a shift…</option>
                  {myShifts.map((s) => (
                    <option key={s.id} value={s.id}>
                      {humanDate(s.date)} {timeRange(s.start, s.end)} · {pos(s.positionId)?.name}
                    </option>
                  ))}
                </select>
              </div>

              {selectedShift && (
                <div className="mt">
                  <h3>Eligible recipients</h3>
                  {eligible.length === 0 ? (
                    <p className="muted">No coworker is currently eligible (availability, qualifications, or compliance).</p>
                  ) : (
                    <ul className="list-reset stack" style={{ gap: "0.4rem" }}>
                      {eligible.map((e) => (
                        <li key={e.id} className="spread">
                          <span>{e.preferredName ?? e.legalName}</span>
                          <button className="button sm primary" onClick={() => offer(e.id)}>Offer</button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {outcome && (
                <div className={`mt ${outcome.status === "auto_approved" ? "badge ok" : "error-summary"}`} role="status" style={outcome.status === "auto_approved" ? {} : undefined}>
                  {outcome.status === "auto_approved"
                    ? "Swap auto-approved — the shift has moved to the recipient."
                    : `Routed to manager review: ${outcome.reasons.join(" ")}`}
                </div>
              )}
            </>
          )}
        </section>

        <section className="card">
          <h2>Open shift marketplace</h2>
          {openShifts.length === 0 ? (
            <p className="muted">No open shifts available right now.</p>
          ) : (
            <ul className="list-reset stack" style={{ gap: "0.5rem" }}>
              {openShifts.map((s) => (
                <li key={s.id} className="spread">
                  <span>{humanDate(s.date)} {timeRange(s.start, s.end)} · {pos(s.positionId)?.name}</span>
                  <span className="badge info">Open</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card">
        <h2>Swap history</h2>
        {db.swaps.length === 0 ? (
          <p className="muted">No swaps yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr><th scope="col">From</th><th scope="col">To</th><th scope="col">Status</th><th scope="col">Detail</th></tr>
              </thead>
              <tbody>
                {db.swaps.map((sw) => (
                  <tr key={sw.id}>
                    <td>{empName(sw.fromEmployeeId)}</td>
                    <td>{empName(sw.toEmployeeId)}</td>
                    <td><span className={`badge ${sw.status === "auto_approved" ? "ok" : sw.status === "manager_review" ? "warn" : ""}`}>{sw.status}</span></td>
                    <td className="muted">{sw.history[sw.history.length - 1]?.detail ?? "—"}</td>
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
