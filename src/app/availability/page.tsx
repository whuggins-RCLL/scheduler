import { AppShell } from "@/components/AppShell";
import { AvailabilityEditor } from "@/components/AvailabilityEditor";

export const metadata = { title: "Availability" };

export default function AvailabilityPage() {
  return (
    <AppShell>
      <AvailabilityEditor />
    </AppShell>
  );
}
