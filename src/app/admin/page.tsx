import { AppShell } from "@/components/AppShell";
import { AdminOverview } from "@/components/admin/AdminOverview";

export const metadata = { title: "Admin" };

export default function Page() {
  return (
    <AppShell>
      <AdminOverview />
    </AppShell>
  );
}
