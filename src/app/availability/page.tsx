import { AppShell } from "@/components/AppShell";
import { AvailabilityEditor } from "@/components/AvailabilityEditor";
import { WorkingHoursEditor } from "@/components/WorkingHoursEditor";
import { DaysOffPanel } from "@/components/DaysOffPanel";
import { TimeOffPanel } from "@/components/TimeOffPanel";

export const metadata = { title: "Availability & Exceptions" };

export default function AvailabilityPage() {
  return (
    <AppShell>
      <div className="stack">
        <div className="page-head">
          <h1>Availability &amp; working hours</h1>
          <p className="muted">
            Keep your general working hours, days off, and desk coverage windows up to date.
            Working hours and desk availability are tracked separately.
          </p>
        </div>
        <WorkingHoursEditor />
        <DaysOffPanel />
        <AvailabilityEditor />
        <TimeOffPanel />
      </div>
    </AppShell>
  );
}
