"use client";

import { AvailabilityEditor } from "@/components/AvailabilityEditor";
import { AvailabilityPreferences } from "@/components/AvailabilityPreferences";
import { WorkingHoursEditor } from "@/components/WorkingHoursEditor";
import { TimeOffPanel } from "@/components/TimeOffPanel";
import { useStore } from "@/lib/store/StoreProvider";
import { resolveEmployeeProfile } from "@/domain/employee-profile";
import { isStudentWorker } from "@/domain/scope";

export function AvailabilityPageContent() {
  const { db, currentUser, viewAs } = useStore();
  const self = resolveEmployeeProfile(db.employees, currentUser, viewAs);
  const isStudent = isStudentWorker(self.classification);

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Availability &amp; exceptions</h1>
        <p className="muted">
          {isStudent
            ? "Sign up for the hours you can work during the submission window. Your manager approves a subset for scheduling. Exceptions are recorded by your manager."
            : "Set your regular weekly working hours first, then desk coverage windows below."}
        </p>
      </div>
      <AvailabilityPreferences />
      {!isStudent && <WorkingHoursEditor />}
      <AvailabilityEditor />
      <TimeOffPanel />
    </div>
  );
}
