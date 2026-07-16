"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store/StoreProvider";
import { buildSchedulerHelper } from "@/domain/scheduling";
import { addDays, WEEKDAY_LABELS, weekdayOf } from "@/domain/time";
import type { Shift } from "@/domain/types";
import { canManage } from "@/domain/scope";
import { humanDate, positionColorVar, statusBadge, timeRange } from "@/lib/ui";
import { fullDayLabel, todayISO } from "@/lib/schedule-view";
import { ShiftDialog } from "./ShiftDialog";
import { CombinedTaskScheduleGrid } from "./CombinedTaskScheduleGrid";
import { PersonalScheduleView } from "./PersonalScheduleView";

type View = "board" | "list" | "grid";

export function ScheduleWorkspace({ scope = "week" }: { scope?: "day" | "week" | "month" }) {
  const store = useStore();
  const { db, currentUser } = store;
  const schedule = db.schedules[0];
  const manager = canManage(currentUser);
  const [view, setView] = useState<View>("board");
  const [gridDate, setGridDate] = useState<string>(todayISO());
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

  const findings = useMemo(() => (schedule && manager ? store.compliance(schedule.id) : []), [store, schedule, manager]);
  const fairness = useMemo(() => (schedule && manager ? store.fairness(schedule.id) : null), [store, schedule, manager]);
  const helperSuggestions = useMemo(() => {
    if (!schedule || !manager) return [];
    const requirements = db.coverage.filter((c) => c.date >= schedule.startDate && c.date <= schedule.endDate);
    return buildSchedulerHelper({ schedule, shifts, requirements, findings });
  }, [db.coverage, findings, manager, schedule, shifts]);

  if (!schedule) return <div className="empty-state">No schedule found.</div>;

  if (!manager) return <PersonalScheduleView />;

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
          <button aria-pressed={view === "grid"} onClick={() => setView("grid")}>Task grid</button>
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
          <div className="mt" aria-label="AI scheduler helper">
            <h2 style={{ marginTop: 0 }}>AI scheduler helper</h2>
            <p className="muted">
              Manager-only assistance for coverage generation, compliance review, fairness checks, and publication readiness.
              Suggestions are deterministic and require manager review before changes are published.
            </p>
            {helperSuggestions.length === 0 ? (
              <p className="muted">No helper actions right now.</p>
            ) : (
              <ul className="list-reset stack" style={{ gap: "0.5rem" }}>
                {helperSuggestions.map((item, index) => (
                  <li key={`${item.kind}-${index}`} className="card" style={{ padding: "0.65rem 0.75rem", boxShadow: "none" }}>
                    <div className="spread">
                      <strong>{item.title}</strong>
                      <span className={`badge ${item.priority === "high" ? "err" : item.priority === "medium" ? "warn" : "info"}`}>
                        {item.priority} priority
                      </span>
                    </div>
                    <p className="muted" style={{ margin: "0.35rem 0 0" }}>{item.detail}</p>
                  </li>
                ))}
              </ul>
            )}
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
      ) : view === "grid" ? (
        <div className="card" style={{ padding: "0.85rem 1rem" }}>
          <div className="spread schedule-day-nav" style={{ flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.65rem" }}>
            <p className="muted" style={{ margin: 0, fontSize: "0.86rem" }}>
              Combined hours × tasks view · {fullDayLabel(gridDate)}
            </p>
            <div className="row" style={{ gap: "0.35rem" }}>
              <button type="button" className="button sm" onClick={() => setGridDate((d) => addDays(d, -1))} aria-label="Previous day">‹</button>
              <button type="button" className="button sm" onClick={() => setGridDate(todayISO())}>Today</button>
              <button type="button" className="button sm" onClick={() => setGridDate((d) => addDays(d, 1))} aria-label="Next day">›</button>
            </div>
          </div>
          <CombinedTaskScheduleGrid
            date={gridDate}
            shifts={shifts}
            deskLocationId="loc-desk"
            deskLabel="Borrowing Desk"
            onSelectShift={manager ? (s) => setDialog({ shift: s, date: s.date }) : undefined}
          />
        </div>
      ) : (
        <ListView days={days} shifts={shifts} empName={empName} pos={pos} taskName={(id) => db.tasks.find((t) => t.id === id)?.name ?? id} />
      )}

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
