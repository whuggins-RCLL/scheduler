import { AppShell } from "@/components/AppShell";
import { TasksView } from "@/components/TasksView";

export const metadata = { title: "Tasks" };

export default function TasksPage() {
  return (
    <AppShell>
      <TasksView />
    </AppShell>
  );
}
