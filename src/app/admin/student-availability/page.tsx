import { AppShell } from "@/components/AppShell";
import { StudentAvailabilityAdmin } from "@/components/admin/StudentAvailabilityAdmin";

export const metadata = { title: "Student availability" };

export default function Page() {
  return (
    <AppShell>
      <StudentAvailabilityAdmin />
    </AppShell>
  );
}
