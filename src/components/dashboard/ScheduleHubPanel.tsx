"use client";

import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store/StoreProvider";
import { resolveEmployeeProfile } from "@/domain/employee-profile";
import { canViewStudentAvailability } from "@/domain/scope";
import { scheduleTypeColorVar } from "@/lib/schedule-view";
import { DeskScheduleBoard } from "./DeskScheduleBoard";
import { MySchedule } from "./MySchedule";
import { StudentAvailabilityGrid } from "./StudentAvailabilityGrid";

const MINE = "mine";
const STUDENTS = "students";

interface Tab {
  id: string; // MINE | STUDENTS | a location id
  label: string;
  color?: string;
  description: string;
}

/**
 * The dashboard schedule hub. "My schedule" first, then one clean tab per active
 * schedule type (desk, stacks, lunches, …) that admins add/remove over the year,
 * plus student availability where applicable. Any view can pop out to a larger
 * overlay.
 */
export function ScheduleHubPanel() {
  const { db, currentUser, viewAs } = useStore();
  const myProfile = useMemo(
    () => resolveEmployeeProfile(db.employees, currentUser, viewAs),
    [db.employees, currentUser, viewAs],
  );
  const showStudents = canViewStudentAvailability(currentUser, myProfile.classification);
  const activeLocations = useMemo(() => db.locations.filter((l) => l.active), [db.locations]);

  const tabs = useMemo<Tab[]>(() => {
    const list: Tab[] = [
      { id: MINE, label: "My schedule", description: "Your assignments across every schedule, in one place." },
    ];
    for (const loc of activeLocations) {
      list.push({
        id: loc.id,
        label: loc.name,
        color: scheduleTypeColorVar(loc.id, activeLocations),
        description: loc.description ?? "Coverage and parallel tasks by hour.",
      });
    }
    if (showStudents) {
      list.push({ id: STUDENTS, label: "Student availability", description: "Combined student-worker availability across the week." });
    }
    return list;
  }, [activeLocations, showStudents]);

  const [tabId, setTabId] = useState<string>(MINE);
  const active = tabs.find((t) => t.id === tabId) ?? tabs[0]!;
  const [popped, setPopped] = useState(false);

  useEffect(() => {
    if (!popped) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPopped(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [popped]);

  const renderView = (id: string) => {
    if (id === MINE) return <MySchedule embedded />;
    if (id === STUDENTS) return <StudentAvailabilityGrid embedded />;
    return <DeskScheduleBoard key={id} embedded fixedLocationId={id} />;
  };

  return (
    <section className="card glass pad-lg schedule-hub" aria-labelledby="schedule-hub-heading">
      <div className="spread schedule-hub-head" style={{ flexWrap: "wrap", gap: "0.75rem", alignItems: "flex-start" }}>
        <div>
          <h2 id="schedule-hub-heading" style={{ marginTop: 0, marginBottom: "0.15rem" }}>{active.label}</h2>
          <p className="muted" style={{ margin: 0, fontSize: "0.86rem" }}>{active.description}</p>
        </div>
        <button type="button" className="button sm" onClick={() => setPopped(true)} aria-haspopup="dialog">
          ⤢ Expand
        </button>
      </div>

      <div className="schedule-tabs" role="tablist" aria-label="Schedule views">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active.id === t.id}
            className={`schedule-tab${active.id === t.id ? " is-active" : ""}`}
            style={t.color ? { ["--type" as string]: t.color } : undefined}
            onClick={() => setTabId(t.id)}
          >
            {t.color && <span className="schedule-tab-dot" aria-hidden />}
            {t.label}
          </button>
        ))}
      </div>

      <div className="schedule-hub-panel" role="tabpanel" aria-label={active.label}>
        {renderView(active.id)}
      </div>

      {popped && (
        <div
          className="dialog-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={`${active.label} — expanded`}
          onClick={(e) => e.target === e.currentTarget && setPopped(false)}
        >
          <div className="dialog schedule-popout">
            <div className="spread" style={{ marginBottom: "0.75rem", flexWrap: "wrap", gap: "0.5rem" }}>
              <div>
                <h2 style={{ margin: 0 }}>{active.label}</h2>
                <p className="muted" style={{ margin: "0.15rem 0 0", fontSize: "0.86rem" }}>{active.description}</p>
              </div>
              <button type="button" className="button sm" onClick={() => setPopped(false)}>Close ✕</button>
            </div>
            <div className="schedule-popout-body">{renderView(active.id)}</div>
          </div>
        </div>
      )}
    </section>
  );
}
