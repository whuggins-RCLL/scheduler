import { AppShell } from "@/components/AppShell";
import { TeamView } from "@/components/TeamView";

export const metadata = { title: "Team" };

export default function TeamPage() {
  return (
    <AppShell>
      <TeamView />
    </AppShell>
  );
}
