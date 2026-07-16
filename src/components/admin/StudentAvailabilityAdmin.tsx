"use client";

import { useState } from "react";
import { useStore } from "@/lib/store/StoreProvider";
import { canManage } from "@/domain/scope";
import { studentAvailabilityStatus } from "@/domain/student-availability";
import { humanDate } from "@/lib/ui";
import type { StudentAvailabilityWindow } from "@/domain/types";

export function StudentAvailabilityAdmin() {
  const { db, currentUser, saveStudentAvailabilityWindow } = useStore();
  const today = new Date().toISOString().slice(0, 10);

  if (!canManage(currentUser)) {
    return <div className="empty-state">You do not have access to this section.</div>;
  }

  const schedule = db.schedules[0];
  const existing = db.studentAvailabilityWindows.find((w) => w.scheduleId === schedule?.id)
    ?? db.studentAvailabilityWindows[0];

  const [label, setLabel] = useState(existing?.label ?? "Current quarter");
  const [opens, setOpens] = useState(existing?.submissionOpens ?? schedule?.startDate ?? today);
  const [closes, setCloses] = useState(existing?.submissionCloses ?? schedule?.endDate ?? today);
  const [enabled, setEnabled] = useState(existing?.enabled ?? false);
  const [frozen, setFrozen] = useState(existing?.frozen ?? false);
  const [saved, setSaved] = useState(false);

  const previewWindow: StudentAvailabilityWindow = {
    id: existing?.id ?? "saw-default",
    scheduleId: schedule?.id ?? "sched-week",
    label,
    submissionOpens: opens,
    submissionCloses: closes,
    enabled,
    frozen,
    updatedBy: currentUser.id,
    updatedAt: "",
  };
  const status = studentAvailabilityStatus(previewWindow, today);

  function save() {
    if (!schedule) return;
    if (closes < opens) return;
    saveStudentAvailabilityWindow({
      ...previewWindow,
      scheduleId: schedule.id,
    });
    setSaved(true);
  }

  const statusLabel: Record<typeof status, string> = {
    disabled: "Closed (not enabled)",
    not_yet_open: "Not yet open",
    open: "Open for student editing",
    frozen: "Frozen",
    closed: "Auto-locked (past close date)",
  };

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Student availability windows</h1>
        <p className="muted">
          Enable and control when student workers can edit their availability sign-up grids.
          After the close date, grids auto-lock. Managers review sign-ups and approve the hours
          to schedule (up to 15 hours per week per student).
        </p>
      </div>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Submission window</h2>
        {!schedule ? (
          <p className="muted">No schedule period is configured yet.</p>
        ) : (
          <>
            <p className="muted" style={{ fontSize: "0.88rem" }}>
              Linked schedule: <strong>{schedule.name}</strong> ({humanDate(schedule.startDate)}–{humanDate(schedule.endDate)})
            </p>

            <div className="field" style={{ maxWidth: 420 }}>
              <label htmlFor="saw-label">Period label</label>
              <input
                id="saw-label"
                type="text"
                value={label}
                onChange={(e) => { setLabel(e.target.value); setSaved(false); }}
                placeholder="e.g. Fall 2026 quarter"
              />
            </div>

            <div className="row">
              <div className="field" style={{ flex: "1 1 180px" }}>
                <label htmlFor="saw-opens">Opens (first editable day)</label>
                <input
                  id="saw-opens"
                  type="date"
                  value={opens}
                  onChange={(e) => { setOpens(e.target.value); setSaved(false); }}
                />
              </div>
              <div className="field" style={{ flex: "1 1 180px" }}>
                <label htmlFor="saw-closes">Closes (last editable day)</label>
                <input
                  id="saw-closes"
                  type="date"
                  value={closes}
                  onChange={(e) => { setCloses(e.target.value); setSaved(false); }}
                />
              </div>
            </div>

            <div className="stack" style={{ gap: "0.75rem", margin: "1rem 0" }}>
              <label className="row" style={{ justifyContent: "flex-start", gap: "0.5rem" }}>
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => { setEnabled(e.target.checked); setSaved(false); }}
                />
                Enable student submission for this period
              </label>
              <label className="row" style={{ justifyContent: "flex-start", gap: "0.5rem" }}>
                <input
                  type="checkbox"
                  checked={frozen}
                  onChange={(e) => { setFrozen(e.target.checked); setSaved(false); }}
                  disabled={!enabled}
                />
                Freeze editing (manual lock — students cannot edit even within the open window)
              </label>
            </div>

            <div className="card glass" style={{ marginBottom: "1rem" }}>
              <div className="spread">
                <span>Current status for students</span>
                <span className={`badge ${status === "open" ? "ok" : status === "frozen" ? "warn" : "info"}`}>
                  {statusLabel[status]}
                </span>
              </div>
              <p className="muted" style={{ margin: "0.5rem 0 0", fontSize: "0.85rem" }}>
                Students see these dates on their availability page. Review and approve sign-ups under
                Availability &amp; exceptions after the submission window.
              </p>
            </div>

            <div className="row">
              <button className="button primary" onClick={save} disabled={closes < opens}>
                Save window settings
              </button>
              {saved && <span role="status" className="badge ok">Saved</span>}
              {closes < opens && <span role="alert" className="badge err">Close date must be on or after open date</span>}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
