import { AppShell } from "@/components/AppShell";
import { InvitationsAdmin } from "@/components/admin/InvitationsAdmin";

export const metadata = { title: "Invitations" };

export default function Page() {
  return (
    <AppShell>
      <InvitationsAdmin />
    </AppShell>
  );
}
