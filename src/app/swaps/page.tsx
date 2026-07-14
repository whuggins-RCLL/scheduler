import { AppShell } from "@/components/AppShell";
import { SwapsView } from "@/components/SwapsView";

export const metadata = { title: "Swaps" };

export default function SwapsPage() {
  return (
    <AppShell>
      <SwapsView />
    </AppShell>
  );
}
