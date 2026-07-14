import { AppShell } from "@/components/AppShell";
import { ScheduleWorkspace } from "@/components/schedule/ScheduleWorkspace";

export const metadata = { title: "Schedule" };

export default function SchedulePage() {
  return (
    <AppShell>
      <ScheduleWorkspace scope="week" />
    </AppShell>
  );
}
