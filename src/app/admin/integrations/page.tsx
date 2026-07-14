import { AppShell } from "@/components/AppShell";
import { IntegrationsAdmin } from "@/components/admin/IntegrationsAdmin";

export const metadata = { title: "Integrations" };

export default function Page() {
  return (
    <AppShell>
      <IntegrationsAdmin />
    </AppShell>
  );
}
