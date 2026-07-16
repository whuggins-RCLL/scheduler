import { AppShell } from "@/components/AppShell";
import { AvailabilityPageContent } from "@/components/AvailabilityPageContent";

export const metadata = { title: "Availability & Exceptions" };

export default function AvailabilityPage() {
  return (
    <AppShell>
      <AvailabilityPageContent />
    </AppShell>
  );
}
