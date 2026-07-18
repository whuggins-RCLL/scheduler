"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/lib/store/StoreProvider";
import { canManage } from "@/domain/scope";
import { DEFAULT_TIMEZONE } from "@/lib/config";
import { defaultFrequency } from "@/domain/frequency";
import { positionScheduleTypeIds } from "@/lib/schedule-type-links";
import {
  MAP_LAYOUT,
  buildScheduleMap,
  edgePath,
  nodeLeftAnchor,
  nodeRightAnchor,
  type MapNode,
} from "@/lib/schedule-map";
import type { Location, Position, Task } from "@/domain/types";
import { FrequencyEditor } from "./FrequencyEditor";

type Draft = Location | Position | Task;

const COLUMN_HEADERS: { kind: MapNode["kind"]; label: string }[] = [
  { kind: "scheduleType", label: "Schedule types" },
  { kind: "position", label: "Positions" },
  { kind: "task", label: "Tasks" },
];

function blankLocation(): Location {
  return {
    id: `loc-${Date.now()}`,
    name: "New schedule type",
    shortName: "New",
    description: undefined,
    timeZone: DEFAULT_TIMEZONE,
    minStaffing: 0,
    openBufferMinutes: 0,
    closeBufferMinutes: 0,
    libcalId: undefined,
    active: true,
  };
}

function blankPosition(order: number): Position {
  return {
    id: `pos-${Date.now()}`,
    name: "New position",
    shortLabel: "New",
    description: undefined,
    colorToken: "position-desk",
    icon: "desk",
    locationId: undefined,
    applicableLocationIds: [],
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
    frequency: defaultFrequency("per_operational_hour"),
    order,
    active: true,
  };
}

function blankTask(order: number): Task {
  return {
    id: `task-${Date.now()}`,
    name: "New task",
    description: undefined,
    category: "General",
    colorToken: "task-neutral",
    icon: "check",
    requiredQualification: undefined,
    applicableLocationIds: [],
    applicablePositionIds: [],
    estimatedMinutes: 30,
    priority: "normal",
    minAssignees: 1,
    maxAssignees: 1,
    allowedDuringPosition: true,
    requiresAcknowledgement: false,
    checklist: [],
    openingDependency: false,
    closingDependency: false,
    frequency: defaultFrequency("times_per_day"),
    order,
    active: true,
  };
}

export function ScheduleMapAdmin() {
  const store = useStore();
  const { db, currentUser } = store;
  const [selected, setSelected] = useState<{ kind: MapNode["kind"]; id: string } | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  const map = useMemo(
    () => buildScheduleMap({ locations: db.locations, positions: db.positions, tasks: db.tasks }),
    [db.locations, db.positions, db.tasks],
  );
  const nodeById = useMemo(() => new Map(map.nodes.map((n) => [n.id, n])), [map.nodes]);

  const selectedNodeId = selected ? `${selected.kind}:${selected.id}` : null;
  const connectedNodeIds = useMemo(() => {
    if (!selectedNodeId) return new Set<string>();
    const set = new Set<string>([selectedNodeId]);
    for (const e of map.edges) {
      if (e.from === selectedNodeId) set.add(e.to);
      if (e.to === selectedNodeId) set.add(e.from);
    }
    return set;
  }, [map.edges, selectedNodeId]);

  if (!canManage(currentUser)) {
    return <div className="empty-state">You do not have access to this section.</div>;
  }

  function onStageMouseDown(e: React.MouseEvent) {
    drag.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  }
  function onStageMouseMove(e: React.MouseEvent) {
    if (!drag.current) return;
    setPan({ x: drag.current.panX + (e.clientX - drag.current.x), y: drag.current.panY + (e.clientY - drag.current.y) });
  }
  function endDrag() {
    drag.current = null;
  }
  function onWheel(e: React.WheelEvent) {
    setZoom((z) => Math.min(1.8, Math.max(0.4, z - Math.sign(e.deltaY) * 0.1)));
  }

  function addLocation() {
    const loc = blankLocation();
    store.upsertLocation(loc);
    setSelected({ kind: "scheduleType", id: loc.id });
  }
  function addPosition() {
    const pos = blankPosition(db.positions.length);
    store.upsertPosition(pos);
    setSelected({ kind: "position", id: pos.id });
  }
  function addTask() {
    const task = blankTask(db.tasks.length);
    store.upsertTask(task);
    setSelected({ kind: "task", id: task.id });
  }

  return (
    <div className="stack smap-page">
      <div className="page-head">
        <h1>Schedule map</h1>
        <p className="muted">
          A live view of the scheduling logic — how schedule types, positions, and tasks connect. Changes
          here write straight to the catalog, so the Positions, Tasks, and Schedule types screens stay in sync.
        </p>
      </div>

      <div className="smap-toolbar">
        <div className="row" style={{ gap: "0.35rem", flexWrap: "wrap" }}>
          <button type="button" className="button sm" onClick={addLocation}>+ Schedule type</button>
          <button type="button" className="button sm" onClick={addPosition}>+ Position</button>
          <button type="button" className="button sm" onClick={addTask}>+ Task</button>
        </div>
        <div className="row" style={{ gap: "0.35rem" }}>
          <span className="smap-legend"><i className="smap-swatch is-scheduleType" /> Schedule type</span>
          <span className="smap-legend"><i className="smap-swatch is-position" /> Position</span>
          <span className="smap-legend"><i className="smap-swatch is-task" /> Task</span>
        </div>
        <div className="row" style={{ gap: "0.3rem" }}>
          <button type="button" className="button sm" onClick={() => setZoom((z) => Math.max(0.4, z - 0.1))} aria-label="Zoom out">−</button>
          <button type="button" className="button sm" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>Reset</button>
          <button type="button" className="button sm" onClick={() => setZoom((z) => Math.min(1.8, z + 0.1))} aria-label="Zoom in">+</button>
        </div>
      </div>

      <div className={`smap-layout${selected ? " has-panel" : ""}`}>
        <div
          className="smap-stage"
          onMouseDown={onStageMouseDown}
          onMouseMove={onStageMouseMove}
          onMouseUp={endDrag}
          onMouseLeave={endDrag}
          onWheel={onWheel}
          role="application"
          aria-label="Schedule map canvas — drag to pan, scroll to zoom"
        >
          <div
            className="smap-viewport"
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, width: map.width, height: map.height }}
          >
            {COLUMN_HEADERS.map(({ kind, label }) => {
              const first = map.nodes.find((n) => n.kind === kind);
              const x = first?.x ?? MAP_LAYOUT.pad;
              return (
                <div key={kind} className="smap-colhead" style={{ left: x, width: MAP_LAYOUT.nodeWidth }}>
                  {label}
                </div>
              );
            })}

            <svg className="smap-edges" width={map.width} height={map.height} aria-hidden>
              {map.edges.map((edge) => {
                const from = nodeById.get(edge.from);
                const to = nodeById.get(edge.to);
                if (!from || !to) return null;
                const highlighted = selectedNodeId
                  ? edge.from === selectedNodeId || edge.to === selectedNodeId
                  : false;
                return (
                  <path
                    key={edge.id}
                    d={edgePath(nodeRightAnchor(from), nodeLeftAnchor(to))}
                    className={`smap-edge is-${edge.kind}${highlighted ? " is-hot" : ""}${selectedNodeId && !highlighted ? " is-dim" : ""}`}
                    fill="none"
                  />
                );
              })}
            </svg>

            {map.nodes.map((node) => {
              const isSelected = node.id === selectedNodeId;
              const dim = selectedNodeId ? !connectedNodeIds.has(node.id) : false;
              return (
                <button
                  key={node.id}
                  type="button"
                  className={`smap-node is-${node.kind}${isSelected ? " is-selected" : ""}${dim ? " is-dim" : ""}${node.active ? "" : " is-inactive"}`}
                  style={{ left: node.x, top: node.y, width: MAP_LAYOUT.nodeWidth, height: MAP_LAYOUT.nodeHeight }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => setSelected({ kind: node.kind, id: node.entityId })}
                >
                  <span className="smap-node-label">{node.label}</span>
                  <span className="smap-node-sub">
                    {node.sublabel}
                    {node.universal && <span className="badge info" style={{ marginLeft: "0.3rem" }}>all types</span>}
                    {!node.active && <span className="badge" style={{ marginLeft: "0.3rem" }}>inactive</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {selected && (
          <NodeEditor
            key={selectedNodeId}
            kind={selected.kind}
            entityId={selected.id}
            onClose={() => setSelected(null)}
          />
        )}
      </div>
    </div>
  );
}

function NodeEditor({
  kind,
  entityId,
  onClose,
}: {
  kind: MapNode["kind"];
  entityId: string;
  onClose: () => void;
}) {
  const store = useStore();
  const { db } = store;

  const entity: Draft | undefined = useMemo(() => {
    if (kind === "scheduleType") return db.locations.find((l) => l.id === entityId);
    if (kind === "position") return db.positions.find((p) => p.id === entityId);
    return db.tasks.find((t) => t.id === entityId);
  }, [db.locations, db.positions, db.tasks, kind, entityId]);

  const [draft, setDraft] = useState<Draft | null>(entity ? structuredClone(entity) : null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDraft(entity ? structuredClone(entity) : null);
    setSaved(false);
  }, [entity]);

  if (!draft) {
    return (
      <aside className="smap-panel">
        <p className="muted">This item was removed.</p>
        <button type="button" className="button sm" onClick={onClose}>Close</button>
      </aside>
    );
  }

  const set = <T extends Draft>(patch: Partial<T>) => {
    setDraft((d) => (d ? ({ ...d, ...patch } as Draft) : d));
    setSaved(false);
  };

  function save() {
    if (!draft) return;
    if (kind === "scheduleType") store.upsertLocation(draft as Location);
    else if (kind === "position") {
      const p = draft as Position;
      store.upsertPosition({ ...p, locationId: p.applicableLocationIds[0] });
    } else store.upsertTask(draft as Task);
    setSaved(true);
  }

  function remove() {
    if (kind === "scheduleType") store.upsertLocation({ ...(draft as Location), active: false });
    else if (kind === "position") store.deletePosition(entityId);
    else store.deleteTask(entityId);
    onClose();
  }

  const activeTypes = [...db.locations].filter((l) => l.active).sort((a, b) => a.name.localeCompare(b.name));
  const activePositions = [...db.positions].filter((p) => p.active).sort((a, b) => a.order - b.order);

  return (
    <aside className="smap-panel">
      <div className="spread" style={{ marginBottom: "0.6rem" }}>
        <h2 style={{ margin: 0, fontSize: "1.05rem" }}>
          {kind === "scheduleType" ? "Schedule type" : kind === "position" ? "Position" : "Task"}
        </h2>
        <button type="button" className="button sm ghost" onClick={onClose}>Close</button>
      </div>

      <label className="field">
        <span>Name</span>
        <input type="text" value={draft.name} onChange={(e) => set({ name: e.target.value })} />
      </label>

      {kind === "scheduleType" && (
        <>
          <label className="field">
            <span>Short name</span>
            <input type="text" value={(draft as Location).shortName} onChange={(e) => set<Location>({ shortName: e.target.value })} />
          </label>
          <label className="field">
            <span>Minimum staffing</span>
            <input type="number" min={0} value={(draft as Location).minStaffing}
              onChange={(e) => set<Location>({ minStaffing: Math.max(0, Number(e.target.value)) })} />
          </label>
        </>
      )}

      {kind === "position" && (
        <>
          <div className="row" style={{ gap: "0.5rem" }}>
            <label className="field" style={{ flex: 1 }}>
              <span>Min</span>
              <input type="number" min={0} value={(draft as Position).minStaffing}
                onChange={(e) => set<Position>({ minStaffing: Math.max(0, Number(e.target.value)) })} />
            </label>
            <label className="field" style={{ flex: 1 }}>
              <span>Preferred</span>
              <input type="number" min={0} value={(draft as Position).preferredStaffing}
                onChange={(e) => set<Position>({ preferredStaffing: Math.max(0, Number(e.target.value)) })} />
            </label>
            <label className="field" style={{ flex: 1 }}>
              <span>Max</span>
              <input type="number" min={0} value={(draft as Position).maxStaffing}
                onChange={(e) => set<Position>({ maxStaffing: Math.max(0, Number(e.target.value)) })} />
            </label>
          </div>
          <FrequencyEditor idPrefix="smap-pos-freq" value={(draft as Position).frequency} onChange={(f) => set<Position>({ frequency: f })} />
          <LinkChips
            title="Schedule types"
            options={activeTypes.map((l) => ({ id: l.id, label: l.name }))}
            selected={positionScheduleTypeIds(draft as Position)}
            onToggle={(id, on) => {
              const current = positionScheduleTypeIds(draft as Position);
              const next = on ? [...new Set([...current, id])] : current.filter((x) => x !== id);
              set<Position>({ applicableLocationIds: next });
            }}
          />
        </>
      )}

      {kind === "task" && (
        <>
          <div className="row" style={{ gap: "0.5rem" }}>
            <label className="field" style={{ flex: 1 }}>
              <span>Minutes</span>
              <input type="number" min={0} step={5} value={(draft as Task).estimatedMinutes}
                onChange={(e) => set<Task>({ estimatedMinutes: Math.max(0, Number(e.target.value)) })} />
            </label>
            <label className="field" style={{ flex: 1 }}>
              <span>Min people</span>
              <input type="number" min={1} value={(draft as Task).minAssignees}
                onChange={(e) => set<Task>({ minAssignees: Math.max(1, Number(e.target.value)) })} />
            </label>
          </div>
          <FrequencyEditor idPrefix="smap-task-freq" value={(draft as Task).frequency} onChange={(f) => set<Task>({ frequency: f })} />
          <LinkChips
            title="Schedule types (none = all)"
            options={activeTypes.map((l) => ({ id: l.id, label: l.name }))}
            selected={(draft as Task).applicableLocationIds}
            onToggle={(id, on) => {
              const current = (draft as Task).applicableLocationIds;
              const next = on ? [...new Set([...current, id])] : current.filter((x) => x !== id);
              set<Task>({ applicableLocationIds: next });
            }}
          />
          <LinkChips
            title="Host positions"
            options={activePositions.map((p) => ({ id: p.id, label: p.name }))}
            selected={(draft as Task).applicablePositionIds}
            onToggle={(id, on) => {
              const current = (draft as Task).applicablePositionIds;
              const next = on ? [...new Set([...current, id])] : current.filter((x) => x !== id);
              set<Task>({ applicablePositionIds: next });
            }}
          />
        </>
      )}

      <div className="row" style={{ gap: "0.5rem", marginTop: "0.8rem", flexWrap: "wrap" }}>
        <button type="button" className="button primary sm" onClick={save}>Save changes</button>
        {saved && <span role="status" className="badge ok">Saved</span>}
        <button type="button" className="button sm ghost" style={{ marginLeft: "auto" }} onClick={remove}>
          {kind === "scheduleType" ? "Deactivate" : "Delete"}
        </button>
      </div>
    </aside>
  );
}

function LinkChips({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: { id: string; label: string }[];
  selected: string[];
  onToggle: (id: string, on: boolean) => void;
}) {
  return (
    <fieldset className="smap-links">
      <legend>{title}</legend>
      {options.length === 0 ? (
        <p className="muted" style={{ margin: 0, fontSize: "0.82rem" }}>None available yet.</p>
      ) : (
        <div className="qual-employee-list">
          {options.map((opt) => {
            const on = selected.includes(opt.id);
            return (
              <label key={opt.id} className={`qual-employee-chip ${on ? "on" : ""}`}>
                <input type="checkbox" checked={on} onChange={(e) => onToggle(opt.id, e.target.checked)} />
                <span>{opt.label}</span>
              </label>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}
