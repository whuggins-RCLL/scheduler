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

  const deptRows = db.departments.map((d) => ({
    name: d.name,
    status: <span className={`badge ${d.active ? "ok" : ""}`}>{d.active ? "Active" : "Inactive"}</span>,
  }));

  const deptName = (id?: string) => (id ? db.departments.find((d) => d.id === id)?.name ?? id : "—");

  const teamRows = db.teams.map((t) => ({
    name: t.name,
    department: deptName(t.departmentId),
    status: <span className={`badge ${t.active ? "ok" : ""}`}>{t.active ? "Active" : "Inactive"}</span>,
  }));

  return (
    <AppShell>
      <div className="stack">
        <ConfigList
          title="Departments"
          description="Organizational units used to scope access and reporting."
          columns={[
            { key: "name", label: "Department" },
            { key: "status", label: "Status" },
          ]}
          rows={deptRows}
          empty="No departments configured."
        />
        <ConfigList
          title="Teams"
          columns={[
            { key: "name", label: "Team" },
            { key: "department", label: "Department" },
            { key: "status", label: "Status" },
          ]}
          rows={teamRows}
          empty="No teams configured."
        />
      </div>
    </AppShell>
  );
}
