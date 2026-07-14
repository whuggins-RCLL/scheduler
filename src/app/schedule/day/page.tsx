import { AppShell } from "@/components/AppShell";
import { ScheduleWorkspace } from "@/components/schedule/ScheduleWorkspace";

export const metadata = { title: "Day schedule" };

export default function DaySchedulePage() {
  return (
    <AppShell>
      <ScheduleWorkspace scope="day" />
    </AppShell>
  );
}
