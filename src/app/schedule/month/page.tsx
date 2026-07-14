import { AppShell } from "@/components/AppShell";
import { ScheduleWorkspace } from "@/components/schedule/ScheduleWorkspace";

export const metadata = { title: "Month schedule" };

export default function MonthSchedulePage() {
  return (
    <AppShell>
      <ScheduleWorkspace scope="month" />
    </AppShell>
  );
}
