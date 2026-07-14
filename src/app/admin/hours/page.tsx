"use client";

import { AppShell } from "@/components/AppShell";
import { ConfigList } from "@/components/admin/ConfigList";
import { useStore } from "@/lib/store/StoreProvider";
import { canManage } from "@/domain/scope";
import { formatTime, WEEKDAY_LABELS } from "@/domain/time";

export default function Page() {
  const { db, currentUser } = useStore();

  if (!canManage(currentUser)) {
    return (
      <AppShell>
        <div className="empty-state">You do not have access to this section.</div>
      </AppShell>
    );
  }

  const locationName = (id: string) => db.locations.find((l) => l.id === id)?.name ?? id;

  const columns = [{ key: "location", label: "Location" }, ...WEEKDAY_LABELS.map((w, i) => ({ key: `d${i}`, label: w }))];

  const rows = db.operatingHours.map((oh) => {
    const row: Record<string, React.ReactNode> = { location: locationName(oh.locationId) };
    for (let d = 0; d < 7; d++) {
      const intervals = oh.weekly[d] ?? [];
      row[`d${d}`] =
        intervals.length === 0
          ? "Closed"
          : intervals.map((iv) => `${formatTime(iv.start)}–${formatTime(iv.end)}`).join(", ");
    }
    return row;
  });

  return (
    <AppShell>
      <ConfigList
        title="Operating hours"
        description="Normal weekly hours per location. 'Closed' indicates no open interval that day."
        columns={columns}
        rows={rows}
        empty="No operating hours configured."
      />
    </AppShell>
  );
}
