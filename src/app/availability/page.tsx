import { AppShell } from "@/components/AppShell";
import { AvailabilityEditor } from "@/components/AvailabilityEditor";
import { WorkingHoursEditor } from "@/components/WorkingHoursEditor";
import { TimeOffPanel } from "@/components/TimeOffPanel";

export const metadata = { title: "Availability & Exceptions" };

export default function AvailabilityPage() {
  return (
    <AppShell>
      <div className="stack">
        <div className="page-head">
          <h1>Availability &amp; working hours</h1>
          <p className="muted">
            Set your regular weekly working hours first, then desk coverage windows below.
            Working hours and desk availability are tracked separately.
          </p>
        </div>
        <WorkingHoursEditor />
        <AvailabilityEditor />
        <TimeOffPanel />
      </div>
    </AppShell>
  );
}
