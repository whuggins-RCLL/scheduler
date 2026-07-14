import { AppShell } from "@/components/AppShell";
import { CalendarView } from "@/components/CalendarView";

export const metadata = { title: "Calendar" };

export default function CalendarPage() {
  return (
    <AppShell>
      <CalendarView />
    </AppShell>
  );
}
