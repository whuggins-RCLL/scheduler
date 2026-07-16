"use client";

import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store/StoreProvider";
import { canManage } from "@/domain/scope";
import { humanDate } from "@/lib/ui";
import type { DayOff, WorkingHoursPattern } from "@/domain/types";

export function DaysOffPanel() {
  const { db, currentUser, saveWorkingHours } = useStore();
  const manager = canManage(currentUser);
  const [targetEmployeeId, setTargetEmployeeId] = useState(currentUser.id);
  const targetEmployee = db.employees.find((e) => e.id === targetEmployeeId);
  const existing = useMemo(
    () => db.workingHours.find((p) => p.employeeId === targetEmployeeId),
    [db.workingHours, targetEmployeeId],
  );
  const [daysOff, setDaysOff] = useState<DayOff[]>(existing?.daysOff ?? []);
  const [date, setDate] = useState("");
  const [dayNote, setDayNote] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!manager && targetEmployeeId !== currentUser.id) setTargetEmployeeId(currentUser.id);
  }, [currentUser.id, manager, targetEmployeeId]);

  useEffect(() => {
    setDaysOff(existing?.daysOff ?? []);
    setSaved(false);
    setError(null);
  }, [existing, targetEmployeeId]);

  async function persist(nextDaysOff: DayOff[]) {
    const pattern: WorkingHoursPattern = {
      id: existing?.id ?? `workhours-${targetEmployeeId}`,
      employeeId: targetEmployeeId,
      label: existing?.label ?? "Current term",
      blocks: existing?.blocks ?? [],
      daysOff: nextDaysOff,
      note: existing?.note,
      updatedBy: currentUser.id,
      updatedAt: new Date().toISOString(),
    };
    setSaving(true);
    setError(null);
    try {
      await saveWorkingHours(pattern);
      setDaysOff(nextDaysOff);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  function addDayOff(e: React.FormEvent) {
    e.preventDefault();
    if (!date) {
      setError("Pick a date for your day off.");
      return;
    }
    if (daysOff.some((d) => d.date === date)) {
      setError("That date is already marked as a day off.");
      return;
    }
    const next = [...daysOff, { date, note: dayNote.trim() || undefined }].sort((a, b) => a.date.localeCompare(b.date));
    void persist(next);
    setDate("");
    setDayNote("");
  }

  function removeDayOff(removeDate: string) {
    void persist(daysOff.filter((d) => d.date !== removeDate));
  }

  const forSelf = targetEmployeeId === currentUser.id;
  const sorted = [...daysOff].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <section className="card" aria-labelledby="days-off-heading">
      <h2 id="days-off-heading">{forSelf ? "My days off" : "Employee days off"}</h2>
      <p className="muted" style={{ fontSize: "0.88rem" }}>
        Mark specific dates when {forSelf ? "you're" : "they're"} not working at all — different from a desk
        availability exception or a one-off unavailable block.
      </p>

      {manager && (
        <div className="field" style={{ maxWidth: 420, marginBottom: "1rem" }}>
          <label htmlFor="days-off-employee">Employee</label>
          <select
            id="days-off-employee"
            value={targetEmployeeId}
            onChange={(e) => setTargetEmployeeId(e.target.value)}
          >
            {db.employees.filter((e) => e.active).map((e) => (
              <option key={e.id} value={e.id}>{e.preferredName ?? e.legalName}</option>
            ))}
          </select>
        </div>
      )}

      <form className="form" onSubmit={addDayOff} style={{ maxWidth: "none" }}>
        <div className="row">
          <div className="field" style={{ flex: "1 1 160px" }}>
            <label htmlFor="day-off-date">Date</label>
            <input id="day-off-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field" style={{ flex: "2 1 220px" }}>
            <label htmlFor="day-off-note">Note (optional)</label>
            <input
              id="day-off-note"
              type="text"
              value={dayNote}
              onChange={(e) => setDayNote(e.target.value)}
              placeholder="e.g. Summer break, finals week"
            />
          </div>
        </div>
        <div className="row">
          <button type="submit" className="button primary" disabled={saving}>
            {saving ? "Saving…" : "Add day off"}
          </button>
          {saved && <span role="status" className="badge ok">Saved</span>}
          {error && <span role="alert" className="badge err">{error}</span>}
        </div>
      </form>

      <hr className="divider" />
      <h3>{forSelf ? "Upcoming days off" : "Scheduled days off"}</h3>
      {sorted.length === 0 ? (
        <p className="muted">No days off on file yet.</p>
      ) : (
        <ul className="list-reset stack" style={{ gap: "0.5rem" }}>
          {sorted.map((d) => (
            <li key={d.date} className="spread">
              <span>
                🏖️ {humanDate(d.date)}
                {d.note ? ` · ${d.note}` : ""}
              </span>
              <button
                type="button"
                className="button sm ghost"
                onClick={() => removeDayOff(d.date)}
                aria-label={`Remove day off ${d.date}`}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
