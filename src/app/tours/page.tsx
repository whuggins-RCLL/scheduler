import { AppShell } from "@/components/AppShell";
import { ToursView } from "@/components/ToursView";

export const metadata = { title: "Tours" };

export default function ToursPage() {
  return (
    <AppShell>
      <ToursView />
    </AppShell>
  );
}
