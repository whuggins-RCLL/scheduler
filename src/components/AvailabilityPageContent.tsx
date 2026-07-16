"use client";

import { AvailabilityEditor } from "@/components/AvailabilityEditor";
import { AvailabilityPreferences } from "@/components/AvailabilityPreferences";
import { StudentQuarterScheduleView } from "@/components/StudentQuarterScheduleView";
import { WorkingHoursEditor } from "@/components/WorkingHoursEditor";
import { TimeOffPanel } from "@/components/TimeOffPanel";
import { useStore } from "@/lib/store/StoreProvider";
import { isStudentWorker } from "@/domain/scope";

export function AvailabilityPageContent() {
  const { db, currentUser } = useStore();
  const self = db.employees.find((e) => e.id === currentUser.id);
  const isStudent = self ? isStudentWorker(self.classification) : false;

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Availability &amp; exceptions</h1>
        <p className="muted">
          {isStudent
            ? "View your quarter working schedule, then set desk coverage during the submission window. Exceptions are recorded by your manager."
            : "Set your regular weekly working hours first, then desk coverage windows below. Working hours and desk availability are tracked separately."}
        </p>
      </div>
      <AvailabilityPreferences />
      {isStudent ? (
        <StudentQuarterScheduleView employeeId={currentUser.id} />
      ) : (
        <WorkingHoursEditor />
      )}
      <AvailabilityEditor />
      <TimeOffPanel />
    </div>
  );
}
