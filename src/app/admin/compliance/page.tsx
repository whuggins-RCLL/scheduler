import { AppShell } from "@/components/AppShell";
import { ComplianceAdmin } from "@/components/admin/ComplianceAdmin";

export const metadata = { title: "Compliance" };

export default function Page() {
  return (
    <AppShell>
      <ComplianceAdmin />
    </AppShell>
  );
}
