import { AppShell } from "@/components/AppShell";
import { ScheduleMapAdmin } from "@/components/admin/ScheduleMapAdmin";

export const metadata = { title: "Schedule map" };

export default function Page() {
  return (
    <AppShell>
      <ScheduleMapAdmin />
    </AppShell>
  );
}
