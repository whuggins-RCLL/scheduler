"use client";

import { useStore } from "@/lib/store/StoreProvider";
import { canManage } from "@/domain/scope";
import { positionColorVar } from "@/lib/ui";

export function PositionsAdmin() {
  const { db, currentUser } = useStore();

  if (!canManage(currentUser)) {
    return <div className="empty-state">You do not have access to this section.</div>;
  }

  const positions = [...db.positions].sort((a, b) => a.order - b.order);

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Positions</h1>
        <p className="muted">
          Service posts and roles that shifts are scheduled against. Colors are always paired with the
          position name — they are a visual aid, never the only signal.
        </p>
      </div>

      <div className="spread">
        <p className="chip">
          <span aria-hidden="true">◍</span> Swatch + label = position identity
        </p>
        <button
          className="button primary"
          disabled
          aria-label="Add position — editing positions is a manager action performed elsewhere"
          title="Editing positions is a manager action performed elsewhere"
        >
          Add position
        </button>
      </div>

      <div className="table-wrap">
        <table className="data">
          <caption>Positions ordered by display order</caption>
          <thead>
            <tr>
              <th scope="col">Position</th>
              <th scope="col">Short</th>
              <th scope="col">Min</th>
              <th scope="col">Preferred</th>
              <th scope="col">Max</th>
              <th scope="col">Public service</th>
              <th scope="col">Swaps</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((p) => (
              <tr key={p.id}>
                <td>
                  <span className="row" style={{ gap: "0.5rem" }}>
                    <span
                      aria-hidden="true"
                      style={{
                        display: "inline-block",
                        width: "0.85rem",
                        height: "0.85rem",
                        borderRadius: "3px",
                        background: positionColorVar(p.colorToken),
                      }}
                    />
                    <span>{p.name}</span>
                  </span>
                </td>
                <td>{p.shortLabel}</td>
                <td>{p.minStaffing}</td>
                <td>{p.preferredStaffing}</td>
                <td>{p.maxStaffing}</td>
                <td>{p.countsAsPublicService ? "Yes" : "No"}</td>
                <td>{p.swapsAllowed ? "Yes" : "No"}</td>
                <td>
                  <span className={`badge ${p.active ? "ok" : ""}`}>{p.active ? "Active" : "Inactive"}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
