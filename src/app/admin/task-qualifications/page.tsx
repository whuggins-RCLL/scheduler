"use client";

import { AppShell } from "@/components/AppShell";
import { TaskQualificationsAdmin } from "@/components/admin/TaskQualificationsAdmin";

export default function Page() {
  return (
    <AppShell>
      <TaskQualificationsAdmin />
    </AppShell>
  );
}
