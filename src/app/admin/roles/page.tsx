"use client";

import { AppShell } from "@/components/AppShell";
import { ConfigList } from "@/components/admin/ConfigList";
import { useStore } from "@/lib/store/StoreProvider";
import { isAdmin } from "@/domain/scope";
import type { Role } from "@/domain/types";

const ROLE_DESCRIPTIONS: { role: Role; description: string }[] = [
  { role: "SUPER_ADMIN", description: "Full org-wide access: manage users, roles, configuration, and every schedule." },
  { role: "MANAGER", description: "Manage staff, schedules, leave, and compliance overrides within their scope." },
  { role: "SCHEDULER", description: "Build and adjust schedules within scope without full user administration." },
  { role: "LIBRARY_STAFF", description: "View own schedule, submit availability, request leave and shift swaps." },
  { role: "VIEWER", description: "Read-only visibility into schedules and rosters; no editing." },
  { role: "AUDITOR", description: "Read-only access to the append-only audit log for oversight and review." },
];

export default function Page() {
  const { currentUser } = useStore();

  if (!isAdmin(currentUser)) {
    return (
      <AppShell>
        <div className="empty-state">You do not have access to this section.</div>
      </AppShell>
    );
  }

  const rows = ROLE_DESCRIPTIONS.map((r) => ({ role: r.role, description: r.description }));

  return (
    <AppShell>
      <ConfigList
        title="Roles"
        description="Reference documentation for the six access roles in Cardinal Shift."
        columns={[
          { key: "role", label: "Role" },
          { key: "description", label: "Description" },
        ]}
        rows={rows}
      />
    </AppShell>
  );
}
