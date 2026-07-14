import { AppShell } from "@/components/AppShell";
import { PositionsAdmin } from "@/components/admin/PositionsAdmin";

export const metadata = { title: "Positions" };

export default function Page() {
  return (
    <AppShell>
      <PositionsAdmin />
    </AppShell>
  );
}
