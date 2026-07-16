"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store/StoreProvider";
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
  const { db, currentUser } = useStore();
  const myProfile = db.employees.find((e) => e.id === currentUser.id);
  const showStudents = canViewStudentAvailability(currentUser, myProfile?.classification);

  const tabs = useMemo(() => {
    const list: ScheduleTab[] = ["mine", "desk"];
    if (showStudents) list.push("students");
    return list;
  }, [showStudents]);

  const [tab, setTab] = useState<ScheduleTab>("mine");

  return (
    <section className="card glass pad-lg schedule-hub" aria-labelledby="schedule-hub-heading">
      <div className="spread schedule-hub-head" style={{ flexWrap: "wrap", gap: "0.75rem" }}>
        <div>
          <h2 id="schedule-hub-heading" style={{ marginTop: 0, marginBottom: "0.15rem" }}>
            {TAB_LABELS[tab]}
          </h2>
          <p className="muted" style={{ margin: 0, fontSize: "0.86rem" }}>
            {tab === "mine" && "Your shifts for the selected day."}
            {tab === "desk" && "Borrowing Services Desk coverage for the selected day."}
            {tab === "students" && "Combined student-worker availability across the week."}
          </p>
        </div>
        <div className="pill-toggle" role="tablist" aria-label="Schedule views">
          {tabs.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              aria-pressed={tab === id}
              onClick={() => setTab(id)}
            >
              {TAB_LABELS[id]}
            </button>
          ))}
        </div>
      </div>

      <div className="schedule-hub-panel" role="tabpanel" aria-label={TAB_LABELS[tab]}>
        {tab === "mine" && <MySchedule embedded />}
        {tab === "desk" && <DeskScheduleBoard embedded />}
        {tab === "students" && <StudentAvailabilityGrid embedded />}
      </div>
    </section>
  );
}
