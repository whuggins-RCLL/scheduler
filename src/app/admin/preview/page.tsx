import { AppShell } from "@/components/AppShell";
import { PreviewAdmin } from "@/components/admin/PreviewAdmin";

export const metadata = { title: "View Previews" };

export default function PreviewPage() {
  return (
    <AppShell>
      <PreviewAdmin />
    </AppShell>
  );
}
