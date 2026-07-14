"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store/StoreProvider";
import { addDays, WEEKDAY_LABELS, weekdayOf } from "@/domain/time";
import type { Shift } from "@/domain/types";
import { canManage, canOverrideCompliance } from "@/domain/scope";
import { hoursLabel, humanDate, positionColorVar, severityBadge, statusBadge, timeRange } from "@/lib/ui";
import { ShiftDialog } from "./ShiftDialog";

type View = "board" | "list";

export function ScheduleWorkspace({ scope = "week" }: { scope?: "day" | "week" | "month" }) {
  const store = useStore();
  const { db, currentUser } = store;
  const schedule = db.schedules[0];
  const manager = canManage(currentUser);
  const [view, setView] = useState<View>("board");
  const [dialog, setDialog] = useState<{ shift?: Shift; date: string } | null>(null);
  const [seed, setSeed] = useState(42);
  const [message, setMessage] = useState<string>("");

  const days = useMemo(() => {
    if (!schedule) return [];
    const count = scope === "day" ? 1 : scope === "month" ? 28 : 7;
    return Array.from({ length: count }, (_, i) => addDays(schedule.startDate, i));
  }, [schedule, scope]);

  const shifts = useMemo(
    () => db.shifts.filter((s) => s.scheduleId === schedule?.id && s.status !== "cancelled"),
    [db.shifts, schedule?.id],
  );

  const findings = useMemo(() => (schedule ? store.compliance(schedule.id) : []), [store, schedule]);
  const fairness = useMemo(() => (schedule ? store.fairness(schedule.id) : null), [store, schedule]);

  if (!schedule) return <div className="empty-state">No schedule found.</div>;

  const empName = (id: string | null) =>
    id ? db.employees.find((e) => e.id === id)?.preferredName ?? "Unknown" : "Open shift";
  const pos = (id: string) => db.positions.find((p) => p.id === id);

  const hardCount = findings.filter((f) => f.severity === "hard").length;

  function doGenerate() {
    const res = store.runGeneration(schedule.id, { seed });
    setMessage(res.explanation);
  }
  function doPublish() {
    const res = store.publishSchedule(schedule.id);
    setMessage(
      res.published
        ? "Schedule published. Assigned employees were notified."
        : `Cannot publish: ${res.blocking.length} blocking compliance issue(s) must be resolved first.`,
    );
  }

  return (
    <div className="stack">
      <div className="spread">
        <div>
          <h1>Schedule workspace</h1>
          <p className="muted">
            {schedule.name} ·{" "}
            <span className={`badge ${schedule.status === "published" ? "ok" : "draft"}`}>
              {schedule.status === "published" ? "Published" : "Draft"} v{schedule.version}
            </span>
          </p>
        </div>
        <div className="pill-toggle" role="group" aria-label="Schedule view">
          <button aria-pressed={view === "board"} onClick={() => setView("board")}>Board</button>
          <button aria-pressed={view === "list"} onClick={() => setView("list")}>List</button>
        </div>
      </div>

      {manager && (
        <div className="card">
          <div className="spread">
            <div className="row">
              <label className="field" style={{ marginBottom: 0 }}>
                <span className="hint">Generation seed (deterministic)</span>
                <input
                  type="number"
                  value={seed}
                  onChange={(e) => setSeed(Number(e.target.value))}
                  style={{ width: 120 }}
                  aria-label="Generation seed"
                />
              </label>
              <button className="button" onClick={doGenerate}>Generate draft</button>
              <button className="button primary" onClick={doPublish} disabled={hardCount > 0}>
                Publish
              </button>
            </div>
            <div className="row">
              <span className="badge info">Coverage {shifts.filter((s) => s.employeeId).length} assigned</span>
              <span className={`badge ${hardCount > 0 ? "err" : "ok"}`}>
                {hardCount > 0 ? `${hardCount} blocking` : "Compliance clear"}
              </span>
              {fairness && (
                <span className="badge" title="Gini of public-service hours; lower is more equal">
                  Fairness Gini {fairness.giniPublicService.toFixed(2)}
                </span>
              )}
            </div>
          </div>
          {message && (
            <p role="status" className="mt muted" style={{ marginBottom: 0 }}>
              {message}
            </p>
          )}
        </div>
      )}

      {view === "board" ? (
        <BoardView
          days={days}
          shifts={shifts}
          empName={empName}
          pos={pos}
          manager={manager}
          onEdit={(shift, date) => setDialog({ shift, date })}
          onAdd={(date) => setDialog({ date })}
          taskName={(id) => db.tasks.find((t) => t.id === id)?.name ?? id}
        />
      ) : (
        <ListView days={days} shifts={shifts} empName={empName} pos={pos} taskName={(id) => db.tasks.find((t) => t.id === id)?.name ?? id} />
      )}

      <div className="grid-2" aria-label="Schedule insights">
          <section className="card">
            <h2>Compliance</h2>
            {findings.length === 0 ? (
              <p className="muted">No compliance issues detected for this schedule.</p>
            ) : (
              <ul className="list-reset stack" style={{ gap: "0.6rem" }}>
                {findings.map((f) => (
                  <li key={f.id} className="card" style={{ padding: "0.65rem 0.75rem", boxShadow: "none" }}>
                    <div className="spread">
                      <span className={`badge ${severityBadge[f.severity].cls}`}>{severityBadge[f.severity].label}</span>
                      {f.employeeId && <small className="muted">{empName(f.employeeId)} · {humanDate(f.date)}</small>}
                    </div>
                    <p style={{ margin: "0.4rem 0 0.2rem" }}>{f.message}</p>
                    <small className="muted">{f.remediation}</small>
                    {manager && f.overrideable && canOverrideCompliance(currentUser) && (
                      <OverrideButton findingRuleId={f.ruleId} employeeId={f.employeeId} date={f.date} />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {fairness && (
            <section className="card">
              <h2>Fairness</h2>
              <p className="muted" style={{ fontSize: "0.82rem" }}>
                Normalized load compares each person&apos;s public-service hours to their fair share
                (scaled by availability and %FTE). 1.0 = exactly fair.
              </p>
              <ul className="list-reset stack" style={{ gap: "0.5rem" }}>
                {fairness.metrics
                  .filter((m) => m.totalMinutes > 0)
                  .sort((a, b) => b.normalizedLoad - a.normalizedLoad)
                  .map((m) => (
                    <li key={m.employeeId}>
                      <div className="spread" style={{ marginBottom: 2 }}>
                        <span>{empName(m.employeeId)}</span>
                        <small className="muted">{hoursLabel(m.totalMinutes)} · load {m.normalizedLoad.toFixed(2)}</small>
                      </div>
                      <div className={`meter ${m.normalizedLoad > 1.25 ? "over" : ""}`} aria-hidden>
                        <span style={{ width: `${Math.min(100, m.normalizedLoad * 50)}%` }} />
                      </div>
                    </li>
                  ))}
              </ul>
            </section>
          )}
      </div>

      {dialog && (
        <ShiftDialog
          shift={dialog.shift}
          scheduleId={schedule.id}
          date={dialog.date}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

function OverrideButton({ findingRuleId, employeeId, date }: { findingRuleId: string; employeeId: string | null; date: string }) {
  const { overrideCompliance, currentUser } = useStore();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  if (!open)
    return (
      <button className="button sm mt" onClick={() => setOpen(true)}>
        Override with reason
      </button>
    );
  return (
    <div className="mt stack" style={{ gap: "0.4rem" }}>
      <input
        aria-label="Override reason"
        placeholder="Reason (required)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <div className="row">
        <button
          className="button sm primary"
          disabled={!reason.trim()}
          onClick={() => overrideCompliance({ findingRuleId, employeeId, date, reason, actorId: currentUser.id })}
        >
          Record override
        </button>
        <button className="button sm" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}

function BoardView({
  days,
  shifts,
  empName,
  pos,
  manager,
  onEdit,
  onAdd,
  taskName,
}: {
  days: string[];
  shifts: Shift[];
  empName: (id: string | null) => string;
  pos: (id: string) => { name: string; shortLabel: string; colorToken: string } | undefined;
  manager: boolean;
  onEdit: (shift: Shift, date: string) => void;
  onAdd: (date: string) => void;
  taskName: (id: string) => string;
}) {
  return (
    <div className="grid" style={{ gridTemplateColumns: `repeat(${Math.min(days.length, 7)}, minmax(150px, 1fr))`, overflowX: "auto" }}>
      {days.map((date) => {
        const dayShifts = shifts.filter((s) => s.date === date).sort((a, b) => a.start - b.start);
        return (
          <section className="card" key={date} style={{ padding: "0.75rem" }} aria-label={humanDate(date)}>
            <div className="spread" style={{ marginBottom: "0.5rem" }}>
              <strong>{WEEKDAY_LABELS[weekdayOf(date)]}</strong>
              <small className="muted">{date.slice(5)}</small>
            </div>
            <div className="stack" style={{ gap: "0.35rem" }}>
              {dayShifts.length === 0 && <small className="muted">No shifts</small>}
              {dayShifts.map((s) => {
                const p = pos(s.positionId);
                return (
                  <button
                    key={s.id}
                    className={`shift-block ${s.status === "draft" ? "is-draft" : ""} ${!s.employeeId ? "is-open" : ""}`}
                    style={{ ["--pos" as string]: positionColorVar(p?.colorToken ?? "") }}
                    onClick={() => manager && onEdit(s, date)}
                    aria-label={`${empName(s.employeeId)}, ${p?.name}, ${timeRange(s.start, s.end)}, ${statusBadge[s.status].label}${s.locked ? ", locked" : ""}`}
                    disabled={!manager}
                  >
                    <span className="st">{timeRange(s.start, s.end)}</span>
                    <div>{empName(s.employeeId)}</div>
                    <small className="muted">{p?.name}{s.locked ? " · 🔒 locked" : ""}</small>
                    {s.taskIds.length > 0 && (
                      <div className="row" style={{ gap: "0.2rem", marginTop: 2 }}>
                        {s.taskIds.map((t) => (
                          <span key={t} className="chip">{taskName(t)}</span>
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
              {manager && (
                <button className="button sm ghost" onClick={() => onAdd(date)} aria-label={`Add shift on ${humanDate(date)}`}>
                  + Add
                </button>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function ListView({
  days,
  shifts,
  empName,
  pos,
  taskName,
}: {
  days: string[];
  shifts: Shift[];
  empName: (id: string | null) => string;
  pos: (id: string) => { name: string } | undefined;
  taskName: (id: string) => string;
}) {
  const rows = shifts
    .filter((s) => days.includes(s.date))
    .sort((a, b) => (a.date + String(a.start).padStart(4, "0")).localeCompare(b.date + String(b.start).padStart(4, "0")));
  return (
    <div className="table-wrap">
      <table className="data">
        <caption className="muted" style={{ padding: "0.5rem", textAlign: "left" }}>
          Screen-reader-friendly list of all shifts in the schedule.
        </caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Time</th>
            <th scope="col">Employee</th>
            <th scope="col">Position</th>
            <th scope="col">Tasks</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id}>
              <td>{humanDate(s.date)}</td>
              <td>{timeRange(s.start, s.end)}</td>
              <td>{empName(s.employeeId)}</td>
              <td>{pos(s.positionId)?.name}</td>
              <td>{s.taskIds.map(taskName).join(", ") || "—"}</td>
              <td><span className={`badge ${statusBadge[s.status].cls}`}>{statusBadge[s.status].label}</span></td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={6} className="muted">No shifts in range.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
