import { AppShell } from "@/components/AppShell";
import { ReportsView } from "@/components/ReportsView";

export const metadata = { title: "Reports" };

export default function ReportsPage() {
  return (
    <AppShell>
      <ReportsView />
    </AppShell>
  );
}
