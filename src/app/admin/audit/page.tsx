import { AppShell } from "@/components/AppShell";
import { AuditAdmin } from "@/components/admin/AuditAdmin";

export const metadata = { title: "Audit" };

export default function Page() {
  return (
    <AppShell>
      <AuditAdmin />
    </AppShell>
  );
}
