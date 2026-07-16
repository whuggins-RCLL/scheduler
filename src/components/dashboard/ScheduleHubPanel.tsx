"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store/StoreProvider";
import { resolveEmployeeProfile } from "@/domain/employee-profile";
import { canViewStudentAvailability } from "@/domain/scope";
import { DeskScheduleBoard } from "./DeskScheduleBoard";
import { MySchedule } from "./MySchedule";
import { StudentAvailabilityGrid } from "./StudentAvailabilityGrid";

type ScheduleTab = "mine" | "desk" | "students";

const TAB_LABELS: Record<ScheduleTab, string> = {
  mine: "My schedule",
  desk: "Desk schedule",
  students: "Student availability",
};

/** Single dashboard panel toggling between personal, desk, and student availability views. */
export function ScheduleHubPanel() {
  const { db, currentUser, viewAs } = useStore();
  const myProfile = useMemo(
    () => resolveEmployeeProfile(db.employees, currentUser, viewAs),
    [db.employees, currentUser, viewAs],
  );
  const showStudents = canViewStudentAvailability(currentUser, myProfile.classification);

  const tabs = useMemo(() => {
    const list: ScheduleTab[] = ["mine", "desk"];
    if (showStudents) list.push("students");
    return list;
  }, [showStudents]);

  const [tab, setTab] = useState<ScheduleTab>("mine");
  const activeTab = tab === "students" && !showStudents ? "mine" : tab;

  return (
    <section className="card glass pad-lg schedule-hub" aria-labelledby="schedule-hub-heading">
      <div className="spread schedule-hub-head" style={{ flexWrap: "wrap", gap: "0.75rem" }}>
        <div>
          <h2 id="schedule-hub-heading" style={{ marginTop: 0, marginBottom: "0.15rem" }}>
            {TAB_LABELS[activeTab]}
          </h2>
          <p className="muted" style={{ margin: 0, fontSize: "0.86rem" }}>
            {activeTab === "mine" && "Your shifts for the selected day."}
            {activeTab === "desk" && "Borrowing desk coverage and parallel tasks by hour — shelving, walkthroughs, breaks, and more."}
            {activeTab === "students" && "Combined student-worker availability across the week."}
          </p>
        </div>
        <div className="pill-toggle" role="tablist" aria-label="Schedule views">
          {tabs.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={activeTab === id}
              aria-pressed={activeTab === id}
              onClick={() => setTab(id)}
            >
              {TAB_LABELS[id]}
            </button>
          ))}
        </div>
      </div>

      <div className="schedule-hub-panel" role="tabpanel" aria-label={TAB_LABELS[activeTab]}>
        {activeTab === "mine" && <MySchedule embedded />}
        {activeTab === "desk" && <DeskScheduleBoard embedded />}
        {activeTab === "students" && <StudentAvailabilityGrid embedded />}
      </div>
    </section>
  );
}
