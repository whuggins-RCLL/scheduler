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

  const rows = db.leaveTypes.map((l) => ({
    name: l.name,
    paid: l.paid ? "Yes" : "No",
    approvalRequired: l.approvalRequired ? "Yes" : "No",
    blocksScheduling: l.blocksScheduling ? "Yes" : "No",
    visibility: l.visibility.replace(/_/g, " "),
    status: <span className={`badge ${l.active ? "ok" : ""}`}>{l.active ? "Active" : "Inactive"}</span>,
  }));

  return (
    <AppShell>
      <ConfigList
        title="Leave types"
        description="Categories of leave and how each behaves for pay, approval, and scheduling."
        columns={[
          { key: "name", label: "Leave type" },
          { key: "paid", label: "Paid" },
          { key: "approvalRequired", label: "Approval required" },
          { key: "blocksScheduling", label: "Blocks scheduling" },
          { key: "visibility", label: "Visibility" },
          { key: "status", label: "Status" },
        ]}
        rows={rows}
        empty="No leave types configured."
      />
    </AppShell>
  );
}
