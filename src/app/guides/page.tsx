import { AppShell } from "@/components/AppShell";
import { GuidesView } from "@/components/GuidesView";

export const metadata = { title: "Guides" };

export default function GuidesPage() {
  return (
    <AppShell>
      <GuidesView />
    </AppShell>
  );
}
