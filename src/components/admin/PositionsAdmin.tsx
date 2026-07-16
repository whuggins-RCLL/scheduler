"use client";

import { useState } from "react";
import { useStore } from "@/lib/store/StoreProvider";
import { canManage } from "@/domain/scope";
import { positionColorVar } from "@/lib/ui";
import type { Position } from "@/domain/types";

const COLOR_TOKENS = [
  "position-desk",
  "position-admin",
  "position-project",
  "position-meetings",
  "position-learning",
];

function blankPosition(order: number): Position {
  return {
    id: `pos-${Date.now()}`,
    name: "",
    shortLabel: "",
    description: undefined,
    colorToken: "position-desk",
    icon: "desk",
    locationId: undefined,
    departmentId: undefined,
    requiredQualification: undefined,
    minStaffing: 1,
    preferredStaffing: 1,
    maxStaffing: 2,
    unlimitedSeating: false,
    minAssignmentMinutes: 60,
    maxContinuousMinutes: 120,
    requiresPhysicalPresence: false,
    blocksOtherAssignments: true,
    countsAsPublicService: false,
    selfClaimable: false,
    swapsAllowed: true,
    eligibleClassifications: [],
    order,
    active: true,
  };
}

export function PositionsAdmin() {
  const { db, currentUser, upsertPosition, archivePosition } = useStore();
  const [editing, setEditing] = useState<Position | null>(null);

  if (!canManage(currentUser)) {
    return <div className="empty-state">You do not have access to this section.</div>;
  }

  const positions = [...db.positions].sort((a, b) => a.order - b.order);

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Positions</h1>
        <p className="muted">
          Create the service posts and roles that shifts are scheduled against. Colors are always paired
          with the position name — a visual aid, never the only signal.
        </p>
      </div>

      <div className="spread">
        <p className="chip"><span aria-hidden="true">◍</span> Swatch + label = position identity</p>
        <button className="button primary" onClick={() => setEditing(blankPosition(positions.length))}>
          + Add position
        </button>
      </div>

      {positions.length === 0 ? (
        <div className="empty-state">No positions yet. Add your first position to start scheduling.</div>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <caption>Positions ordered by display order</caption>
            <thead>
              <tr>
                <th scope="col">Position</th>
                <th scope="col">Short</th>
                <th scope="col">Min / Pref / Max</th>
                <th scope="col">Public service</th>
                <th scope="col">Swaps</th>
                <th scope="col">Status</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => (
                <tr key={p.id}>
                  <td>
                    <span className="row" style={{ gap: "0.5rem" }}>
                      <span aria-hidden="true" style={{ display: "inline-block", width: "0.85rem", height: "0.85rem", borderRadius: "3px", background: positionColorVar(p.colorToken) }} />
                      <span>{p.name}</span>
                    </span>
                  </td>
                  <td>{p.shortLabel}</td>
                  <td>{p.minStaffing} / {p.preferredStaffing} / {p.unlimitedSeating ? "∞" : p.maxStaffing}</td>
                  <td>{p.countsAsPublicService ? "Yes" : "No"}</td>
                  <td>{p.swapsAllowed ? "Yes" : "No"}</td>
                  <td><span className={`badge ${p.active ? "ok" : ""}`}>{p.active ? "Active" : "Archived"}</span></td>
                  <td>
                    <div className="row">
                      <button className="button sm" onClick={() => setEditing({ ...p })}>Edit</button>
                      {p.active && (
                        <button className="button sm danger" onClick={() => archivePosition(p.id)} aria-label={`Archive ${p.name}`}>Archive</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <PositionDialog
          position={editing}
          locations={db.locations}
          onCancel={() => setEditing(null)}
          onSave={(p) => { upsertPosition(p); setEditing(null); }}
        />
      )}
    </div>
  );
}

function PositionDialog({
  position,
  locations,
  onCancel,
  onSave,
}: {
  position: Position;
  locations: { id: string; name: string }[];
  onCancel: () => void;
  onSave: (p: Position) => void;
}) {
  const [p, setP] = useState<Position>(position);
  const [error, setError] = useState("");
  const set = <K extends keyof Position>(k: K, v: Position[K]) => setP((cur) => ({ ...cur, [k]: v }));

  function save() {
    if (!p.name.trim()) { setError("Name is required."); return; }
    if (!p.unlimitedSeating && p.maxStaffing < p.minStaffing) { setError("Max staffing must be ≥ min staffing."); return; }
    onSave({ ...p, shortLabel: p.shortLabel.trim() || p.name.trim().slice(0, 6) });
  }

  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="pos-dialog-title" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="dialog">
        <h2 id="pos-dialog-title">{position.name ? "Edit position" : "Add position"}</h2>
        {error && <div className="error-summary" role="alert">{error}</div>}
        <div className="form" style={{ maxWidth: "none" }}>
          <div className="field">
            <label htmlFor="p-name">Name</label>
            <input id="p-name" value={p.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div className="row">
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="p-short">Short label</label>
              <input id="p-short" value={p.shortLabel} onChange={(e) => set("shortLabel", e.target.value)} />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="p-color">Color</label>
              <select id="p-color" value={p.colorToken} onChange={(e) => set("colorToken", e.target.value)}>
                {COLOR_TOKENS.map((c) => <option key={c} value={c}>{c.replace("position-", "")}</option>)}
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="p-loc">Location</label>
            <select id="p-loc" value={p.locationId ?? ""} onChange={(e) => set("locationId", e.target.value || undefined)}>
              <option value="">Any / none</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div className="row">
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="p-min">Min staffing</label>
              <input id="p-min" type="number" min={0} value={p.minStaffing} onChange={(e) => set("minStaffing", Number(e.target.value))} />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="p-pref">Preferred</label>
              <input id="p-pref" type="number" min={0} value={p.preferredStaffing} onChange={(e) => set("preferredStaffing", Number(e.target.value))} />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="p-max">Max</label>
              <input
                id="p-max"
                type="number"
                min={1}
                value={p.maxStaffing}
                disabled={p.unlimitedSeating}
                onChange={(e) => set("maxStaffing", Number(e.target.value))}
              />
            </div>
          </div>
          <label className="row" style={{ gap: "0.4rem" }}>
            <input
              type="checkbox"
              style={{ width: "auto", minHeight: 0 }}
              checked={p.unlimitedSeating ?? false}
              onChange={(e) => set("unlimitedSeating", e.target.checked)}
            />
            Unlimited seatings (no maximum — skips staffing caps when assigning)
          </label>
          <div className="field">
            <label htmlFor="p-cont">Max continuous minutes</label>
            <input id="p-cont" type="number" min={0} step={15} value={p.maxContinuousMinutes} onChange={(e) => set("maxContinuousMinutes", Number(e.target.value))} />
          </div>
          <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
            <legend style={{ fontWeight: 600, fontSize: "0.88rem" }}>Options</legend>
            <label className="row" style={{ gap: "0.4rem" }}><input type="checkbox" style={{ width: "auto", minHeight: 0 }} checked={p.countsAsPublicService} onChange={(e) => set("countsAsPublicService", e.target.checked)} /> Counts as public service</label>
            <label className="row" style={{ gap: "0.4rem" }}><input type="checkbox" style={{ width: "auto", minHeight: 0 }} checked={p.requiresPhysicalPresence} onChange={(e) => set("requiresPhysicalPresence", e.target.checked)} /> Requires physical presence</label>
            <label className="row" style={{ gap: "0.4rem" }}><input type="checkbox" style={{ width: "auto", minHeight: 0 }} checked={p.swapsAllowed} onChange={(e) => set("swapsAllowed", e.target.checked)} /> Swaps allowed</label>
            <label className="row" style={{ gap: "0.4rem" }}><input type="checkbox" style={{ width: "auto", minHeight: 0 }} checked={p.selfClaimable} onChange={(e) => set("selfClaimable", e.target.checked)} /> Employees may self-claim open shifts</label>
          </fieldset>
          <div className="row">
            <button className="button primary" onClick={save}>Save position</button>
            <button className="button" onClick={onCancel}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}
