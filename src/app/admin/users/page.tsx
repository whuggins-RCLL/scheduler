import { AppShell } from "@/components/AppShell";
import { UsersAdmin } from "@/components/admin/UsersAdmin";

export const metadata = { title: "Users" };

export default function UsersPage() {
  return (
    <AppShell>
      <UsersAdmin />
    </AppShell>
  );
}
