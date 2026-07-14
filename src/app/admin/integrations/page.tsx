import { AppShell } from "@/components/AppShell";
import { LibCalHoursPanel } from "@/components/integrations/LibCalHoursPanel";

export default function Page() {
  return (
    <AppShell>
      <h1>Admin: integrations</h1>
      <LibCalHoursPanel />
    </AppShell>
  );
}
