import { AppShell } from "@/components/AppShell";
import { AvailabilityEditor } from "@/components/AvailabilityEditor";
import { TimeOffPanel } from "@/components/TimeOffPanel";

export const metadata = { title: "Availability & Exceptions" };

export default function AvailabilityPage() {
  return (
    <AppShell>
      <div className="stack">
        <AvailabilityEditor />
        <TimeOffPanel />
      </div>
    </AppShell>
  );
}
