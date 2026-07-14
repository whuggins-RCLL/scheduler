"use client";

import { AppShell } from "@/components/AppShell";
import { ConfigList } from "@/components/admin/ConfigList";
import { useStore } from "@/lib/store/StoreProvider";
import { canManage } from "@/domain/scope";

export default function Page() {
  const { db, currentUser } = useStore();

  if (!canManage(currentUser)) {
    return (
      <AppShell>
        <div className="empty-state">You do not have access to this section.</div>
      </AppShell>
    );
  }

  const rows = [...db.positions]
    .sort((a, b) => a.order - b.order)
    .map((p) => ({
      position: p.name,
      required: p.requiredQualification ?? "—",
      qualified: db.employees.filter((e) => e.qualifiedPositionIds.includes(p.id)).length,
    }));

  return (
    <AppShell>
      <ConfigList
        title="Qualifications"
        description="Qualification requirements per position and how many employees are currently qualified for each."
        columns={[
          { key: "position", label: "Position" },
          { key: "required", label: "Required qualification" },
          { key: "qualified", label: "Qualified employees" },
        ]}
        rows={rows}
        empty="No positions configured."
      />
    </AppShell>
  );
}
