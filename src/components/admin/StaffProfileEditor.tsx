"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { EmployeeProfile, EmploymentClassification } from "@/domain/types";
import { defaultEmployeeProfile, hasStaffRole } from "@/lib/store/employee-profile";
import { useStore } from "@/lib/store/StoreProvider";

const CLASSIFICATIONS: EmploymentClassification[] = [
  "student_worker",
  "non_exempt_staff",
  "exempt_staff",
  "manager",
  "temporary",
  "casual",
  "other",
];

type NumericProfileField =
  | "targetWeeklyHours"
  | "maxWeeklyHours"
  | "maxDailyHours"
  | "employmentPercentage";

function label(value: string): string {
  return value.replaceAll("_", " ").replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

export function StaffProfileEditor() {
  const { db, saveEmployeeProfile } = useStore();
  const activeUsers = useMemo(
    () => db.users.filter((user) => user.state === "active"),
    [db.users],
  );
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<EmployeeProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    if (!activeUsers.some((user) => user.id === selectedId)) setSelectedId(activeUsers[0]?.id ?? "");
  }, [activeUsers, selectedId]);

  useEffect(() => {
    const user = activeUsers.find((item) => item.id === selectedId);
    if (!user) {
      setDraft(null);
      return;
    }
    setDraft(db.employees.find((employee) => employee.id === user.id) ?? defaultEmployeeProfile(user));
    setMessage(null);
  }, [activeUsers, db.employees, selectedId]);

  function update<K extends keyof EmployeeProfile>(key: K, value: EmployeeProfile[K]) {
    setDraft((current) => current ? { ...current, [key]: value } : current);
    setMessage(null);
  }

  function numberUpdate(key: NumericProfileField, value: string) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) update(key, parsed);
  }

  function togglePosition(positionId: string, checked: boolean) {
    if (!draft) return;
    const ids = checked
      ? [...new Set([...draft.qualifiedPositionIds, positionId])]
      : draft.qualifiedPositionIds.filter((id) => id !== positionId);
    update("qualifiedPositionIds", ids);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || !selectedUser) return;
    setSaving(true);
    setMessage(null);
    try {
      await saveEmployeeProfile({
        ...draft,
        active: hasStaffRole(selectedUser) && draft.active,
        setupComplete: true,
      });
      setMessage({ kind: "ok", text: "Staff profile saved. Team and Availability will update automatically." });
    } catch (error) {
      setMessage({ kind: "err", text: error instanceof Error ? error.message : String(error) });
    } finally {
      setSaving(false);
    }
  }

  if (activeUsers.length === 0) {
    return <section className="card"><h2>Staff onboarding</h2><p className="muted">No active accounts are available.</p></section>;
  }

  const selectedUser = activeUsers.find((user) => user.id === selectedId);

  return (
    <section className="card" aria-labelledby="staff-onboarding-heading">
      <h2 id="staff-onboarding-heading">Staff onboarding</h2>
      <p className="muted">
        Scheduling membership is separate from permissions. Administrators can also have an active staff profile.
      </p>

      <form className="stack" onSubmit={submit}>
        <div className="field" style={{ maxWidth: 520 }}>
          <label htmlFor="staff-account">Account</label>
          <select id="staff-account" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
            {activeUsers.map((user) => (
              <option key={user.id} value={user.id}>{user.displayName} — {user.email}</option>
            ))}
          </select>
        </div>

        {draft && selectedUser && (
          <>
            {!hasStaffRole(selectedUser) && (
              <p role="alert" className="badge warn">
                Assign an Employee, Scheduler, Manager, or Super Admin role before scheduling this account.
              </p>
            )}

            <label className="row">
              <input
                type="checkbox"
                checked={draft.active}
                disabled={!hasStaffRole(selectedUser)}
                onChange={(event) => update("active", event.target.checked)}
              />
              Include in Team, Availability, and scheduling
            </label>

            <div className="form-grid">
              <div className="field">
                <label htmlFor="staff-name">Name</label>
                <input id="staff-name" value={draft.legalName} onChange={(event) => update("legalName", event.target.value)} required />
              </div>
              <div className="field">
                <label htmlFor="staff-classification">Classification</label>
                <select
                  id="staff-classification"
                  value={draft.classification}
                  onChange={(event) => update("classification", event.target.value as EmploymentClassification)}
                >
                  {CLASSIFICATIONS.map((classification) => (
                    <option key={classification} value={classification}>{label(classification)}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="staff-target-hours">Target weekly hours</label>
                <input id="staff-target-hours" type="number" min="0" max="80" step="0.5" value={draft.targetWeeklyHours} onChange={(event) => numberUpdate("targetWeeklyHours", event.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="staff-max-hours">Maximum weekly hours</label>
                <input id="staff-max-hours" type="number" min="0" max="100" step="0.5" value={draft.maxWeeklyHours} onChange={(event) => numberUpdate("maxWeeklyHours", event.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="staff-daily-hours">Maximum daily hours</label>
                <input id="staff-daily-hours" type="number" min="0" max="24" step="0.5" value={draft.maxDailyHours} onChange={(event) => numberUpdate("maxDailyHours", event.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="staff-percentage">Employment percentage</label>
                <input id="staff-percentage" type="number" min="0" max="1" step="0.05" value={draft.employmentPercentage} onChange={(event) => numberUpdate("employmentPercentage", event.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="staff-department">Department</label>
                <select id="staff-department" value={draft.departmentId ?? ""} onChange={(event) => update("departmentId", event.target.value || undefined)}>
                  <option value="">Not assigned</option>
                  {db.departments.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="staff-location">Primary location</label>
                <select id="staff-location" value={draft.primaryLocationId ?? ""} onChange={(event) => update("primaryLocationId", event.target.value || undefined)}>
                  <option value="">Not assigned</option>
                  {db.locations.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="staff-manager">Primary manager</label>
                <select id="staff-manager" value={draft.primaryManagerId ?? ""} onChange={(event) => update("primaryManagerId", event.target.value || undefined)}>
                  <option value="">Not assigned</option>
                  {db.employees.filter((employee) => employee.active && employee.id !== draft.id).map((employee) => (
                    <option key={employee.id} value={employee.id}>{employee.preferredName ?? employee.legalName}</option>
                  ))}
                </select>
              </div>
            </div>

            <fieldset className="field">
              <legend>Qualified positions</legend>
              {db.positions.filter((position) => position.active).length === 0 ? (
                <span className="muted">No active positions have been configured.</span>
              ) : (
                <div className="row">
                  {db.positions.filter((position) => position.active).map((position) => (
                    <label className="chip" key={position.id}>
                      <input
                        type="checkbox"
                        checked={draft.qualifiedPositionIds.includes(position.id)}
                        onChange={(event) => togglePosition(position.id, event.target.checked)}
                      />
                      {position.name}
                    </label>
                  ))}
                </div>
              )}
            </fieldset>

            <div className="row">
              <button className="button primary" type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save staff profile"}
              </button>
              {message && (
                <span role={message.kind === "err" ? "alert" : "status"} className={`badge ${message.kind === "err" ? "err" : "ok"}`}>
                  {message.text}
                </span>
              )}
            </div>
          </>
        )}
      </form>
    </section>
  );
}
