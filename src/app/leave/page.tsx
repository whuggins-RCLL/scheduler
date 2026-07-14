import { AppShell } from "@/components/AppShell";
import { LeaveView } from "@/components/LeaveView";

export const metadata = { title: "Leave" };

export default function LeavePage() {
  return (
    <AppShell>
      <LeaveView />
    </AppShell>
  );
}
