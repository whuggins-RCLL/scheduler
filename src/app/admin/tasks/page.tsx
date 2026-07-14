import { AppShell } from "@/components/AppShell";
import { TasksAdmin } from "@/components/admin/TasksAdmin";

export const metadata = { title: "Tasks" };

export default function Page() {
  return (
    <AppShell>
      <TasksAdmin />
    </AppShell>
  );
}
