import { AppShell } from "@/components/AppShell";
import { ScheduleWorkspace } from "@/components/schedule/ScheduleWorkspace";

export const metadata = { title: "Week schedule" };

export default function WeekSchedulePage() {
  return (
    <AppShell>
      <ScheduleWorkspace scope="week" />
    </AppShell>
  );
}
