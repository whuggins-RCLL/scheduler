"use client";

import { useState } from "react";
import { useStore } from "@/lib/store/StoreProvider";
import { isAdmin, hasRole } from "@/domain/scope";
import { humanDate } from "@/lib/ui";

export function AuditAdmin() {
  const { db, currentUser } = useStore();
  const [filter, setFilter] = useState("");

  if (!isAdmin(currentUser) && !hasRole(currentUser, "AUDITOR")) {
    return <div className="empty-state">You do not have access to this section.</div>;
  }

  const actorName = (id: string): string => db.users.find((u) => u.id === id)?.displayName ?? id;

  const q = filter.trim().toLowerCase();
  const events = db.audit.filter((e) => {
    if (!q) return true;
    return e.action.toLowerCase().includes(q) || actorName(e.actorId).toLowerCase().includes(q);
  });

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Audit log</h1>
        <p className="muted">
          Append-only record of every consequential action. Entries are never edited or deleted; newest
          first.
        </p>
      </div>

      <div className="field" style={{ maxWidth: "360px" }}>
        <label htmlFor="audit-filter">Filter by action or actor</label>
        <input
          id="audit-filter"
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="e.g. publish, Huggins"
          aria-label="Filter audit events by action or actor"
        />
      </div>

      {events.length === 0 ? (
        <div className="empty-state">No audit events match your filter.</div>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <caption>Audit events, newest first</caption>
            <thead>
              <tr>
                <th scope="col">Actor</th>
                <th scope="col">Action</th>
                <th scope="col">Target</th>
                <th scope="col">Reason</th>
                <th scope="col">When</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td>{actorName(e.actorId)}</td>
                  <td>
                    <span className="badge info">{e.action}</span>
                  </td>
                  <td>
                    {e.targetType}:{e.targetId}
                  </td>
                  <td>{e.reason ?? "—"}</td>
                  <td>{humanDate(e.createdAt.slice(0, 10))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
