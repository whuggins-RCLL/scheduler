import { AppShell } from "@/components/AppShell";
import { SettingsView } from "@/components/SettingsView";

export const metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <AppShell>
      <SettingsView />
    </AppShell>
  );
}
