"use client";

import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store/StoreProvider";
import { WEEKDAY_LABELS, formatTime } from "@/domain/time";
import type { AvailabilityKind, AvailabilityBlock, AvailabilityPattern } from "@/domain/types";

const HOURS = Array.from({ length: 13 }, (_, i) => 8 + i); // 08:00 .. 20:00
const CYCLE: AvailabilityKind[] = ["unavailable", "available", "preferred"];
const KIND_LABEL: Record<AvailabilityKind, string> = {
  unavailable: "Unavailable",
  available: "Available",
  preferred: "Preferred",
};

type Cell = Record<string, AvailabilityKind>; // key `${day}-${hour}`

function blocksToCells(blocks: AvailabilityBlock[]): Cell {
  const cell: Cell = {};
  for (const b of blocks) {
    for (let h = Math.floor(b.start / 60); h < Math.ceil(b.end / 60); h++) {
      if (h >= 8 && h < 21) cell[`${b.weekday}-${h}`] = b.kind;
    }
  }
  return cell;
}

function cellsToBlocks(cell: Cell): AvailabilityBlock[] {
  const blocks: AvailabilityBlock[] = [];
  for (let day = 0; day < 7; day++) {
    let run: { start: number; kind: AvailabilityKind } | null = null;
    for (const h of [...HOURS, 21]) {
      const kind = cell[`${day}-${h}`];
      if (run && (kind !== run.kind || h === 21)) {
        blocks.push({ weekday: day, start: run.start * 60, end: h * 60, kind: run.kind });
        run = null;
      }
      if (kind && kind !== "unavailable" && !run) run = { start: h, kind };
      else if (kind && run && kind === run.kind) {
        /* continue run */
      }
    }
  }
  return blocks;
}

export function AvailabilityEditor() {
  const { db, currentUser, saveAvailability } = useStore();
  const existing = useMemo(
    () => db.availability.find((p) => p.employeeId === currentUser.id),
    [db.availability, currentUser.id],
  );
  const [cells, setCells] = useState<Cell>(() => blocksToCells(existing?.blocks ?? []));
  const [note, setNote] = useState(existing?.note ?? "");
  const [saved, setSaved] = useState(false);

  // Resync the editor when the active employee changes (e.g. demo user switch)
  // or when their stored pattern is updated elsewhere.
  useEffect(() => {
    setCells(blocksToCells(existing?.blocks ?? []));
    setNote(existing?.note ?? "");
    setSaved(false);
    // Resync only when the active employee changes (e.g. demo user switch).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.id]);

  function cycle(day: number, hour: number) {
    const key = `${day}-${hour}`;
    setSaved(false);
    setCells((c) => {
      const cur = c[key] ?? "unavailable";
      const nextKind = CYCLE[(CYCLE.indexOf(cur) + 1) % CYCLE.length];
      return { ...c, [key]: nextKind };
    });
  }

  function setColumn(day: number, kind: AvailabilityKind) {
    setSaved(false);
    setCells((c) => {
      const next = { ...c };
      for (const h of HOURS) next[`${day}-${h}`] = kind;
      return next;
    });
  }

  function save() {
    const pattern: AvailabilityPattern = {
      id: existing?.id ?? `avail-${currentUser.id}`,
      employeeId: currentUser.id,
      label: existing?.label ?? "Current term",
      blocks: cellsToBlocks(cells),
      note,
      updatedBy: currentUser.id,
      updatedAt: new Date().toISOString(),
    };
    saveAvailability(pattern);
    setSaved(true);
  }

  return (
    <div className="stack">
      <div className="page-head">
        <h1>My availability</h1>
        <p className="muted">
          Click a cell to cycle Unavailable → Available → Preferred. Every action is keyboard-operable —
          no dragging required. Managers schedule around these windows.
        </p>
      </div>

      <div className="card">
        <div className="row" style={{ marginBottom: "0.75rem" }}>
          <span className="badge">Legend</span>
          <span className="chip" style={{ background: "color-mix(in srgb, var(--palo-alto) 22%, var(--surface))" }}>Preferred</span>
          <span className="chip" style={{ background: "color-mix(in srgb, var(--info) 15%, var(--surface))" }}>Available</span>
          <span className="chip">Unavailable</span>
        </div>

        <div style={{ overflowX: "auto" }}>
          <div className="avail-grid" role="grid" aria-label="Weekly availability">
            <div className="avail-head" role="columnheader">Time</div>
            {WEEKDAY_LABELS.map((d, i) => (
              <div className="avail-head" role="columnheader" key={d}>
                {d}
                <div>
                  <button className="button sm ghost" style={{ fontSize: "0.65rem", padding: "0 4px", minHeight: 20 }} onClick={() => setColumn(i, "available")} aria-label={`Mark all ${d} available`}>all</button>
                  <button className="button sm ghost" style={{ fontSize: "0.65rem", padding: "0 4px", minHeight: 20 }} onClick={() => setColumn(i, "unavailable")} aria-label={`Clear all ${d}`}>×</button>
                </div>
              </div>
            ))}
            {HOURS.map((h) => (
              <div key={h} style={{ display: "contents" }}>
                <div className="avail-rowlabel" role="rowheader">{formatTime(h * 60)}</div>
                {WEEKDAY_LABELS.map((_, day) => {
                  const kind = cells[`${day}-${h}`] ?? "unavailable";
                  return (
                    <button
                      key={`${day}-${h}`}
                      role="gridcell"
                      className={`avail-cell ${kind}`}
                      onClick={() => cycle(day, h)}
                      aria-label={`${WEEKDAY_LABELS[day]} ${formatTime(h * 60)}: ${KIND_LABEL[kind]}. Activate to change.`}
                    >
                      {kind === "preferred" ? "★" : kind === "available" ? "✓" : ""}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        <div className="field mt">
          <label htmlFor="avail-note">Availability note (optional)</label>
          <textarea id="avail-note" value={note} onChange={(e) => { setNote(e.target.value); setSaved(false); }} placeholder="e.g. Prefer not to close on weekdays during finals." />
        </div>

        <div className="row">
          <button className="button primary" onClick={save}>Save availability</button>
          {saved && <span role="status" className="badge ok">Saved</span>}
        </div>
      </div>
    </div>
  );
}
