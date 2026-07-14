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

  const rows = db.locations.map((l) => ({
    name: l.name,
    shortName: l.shortName,
    timeZone: l.timeZone,
    minStaffing: l.minStaffing,
    libcalId: l.libcalId ?? "—",
    status: <span className={`badge ${l.active ? "ok" : ""}`}>{l.active ? "Active" : "Inactive"}</span>,
  }));

  return (
    <AppShell>
      <ConfigList
        title="Locations"
        description="Physical service points with their time zone and minimum staffing."
        columns={[
          { key: "name", label: "Location" },
          { key: "shortName", label: "Short name" },
          { key: "timeZone", label: "Time zone" },
          { key: "minStaffing", label: "Min staffing" },
          { key: "libcalId", label: "LibCal ID" },
          { key: "status", label: "Status" },
        ]}
        rows={rows}
        empty="No locations configured."
      />
    </AppShell>
  );
}
