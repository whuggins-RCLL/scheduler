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
  mapCoverageMetrics,
  nodeLeftAnchor,
  nodeRightAnchor,
  type MapCoverage,
  type MapNode,
  type NodeCoverage,
} from "@/lib/schedule-map";
import { buildCoverageRequirements } from "@/domain/coverage-generation";
import { addDays } from "@/domain/time";
import type { Location, Position, Task } from "@/domain/types";
import { FrequencyEditor } from "./FrequencyEditor";

type Draft = Location | Position | Task;

const COLUMN_HEADERS: { kind: MapNode["kind"]; label: string; index: number }[] = [
  { kind: "scheduleType", label: "Schedule types", index: 0 },
  { kind: "position", label: "Positions", index: 1 },
  { kind: "task", label: "Tasks", index: 2 },
];

/** Fixed x for a column header, independent of whether that column has nodes. */
function columnHeaderX(index: number): number {
  return MAP_LAYOUT.pad + index * (MAP_LAYOUT.nodeWidth + MAP_LAYOUT.colGap);
}

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
  const [showCoverage, setShowCoverage] = useState(true);
  const [showGaps, setShowGaps] = useState(false);
  const [layout, setLayout] = useState<Record<string, { x: number; y: number }>>({});
  // Drag-to-connect: active link being drawn from a node's connect handle.
  const [link, setLink] = useState<{ fromId: string; fromKind: MapNode["kind"]; fromEntityId: string } | null>(null);
  const [linkCursor, setLinkCursor] = useState<{ x: number; y: number } | null>(null);
  const [linkTarget, setLinkTarget] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const nodeDrag = useRef<{ id: string; startX: number; startY: number; origX: number; origY: number; moved: boolean } | null>(null);
  const movedRef = useRef(false);
  const stageRef = useRef<HTMLDivElement>(null);

  const layoutKey = `rcll-schedule-map-layout:${currentUser.id}`;
  // Load this admin's saved node positions once mounted (client only).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(layoutKey);
      setLayout(raw ? (JSON.parse(raw) as Record<string, { x: number; y: number }>) : {});
    } catch {
      setLayout({});
    }
  }, [layoutKey]);

  const map = useMemo(
    () => buildScheduleMap({ locations: db.locations, positions: db.positions, tasks: db.tasks }),
    [db.locations, db.positions, db.tasks],
  );
  // Effective positions = computed layout with any saved/dragged overrides.
  const nodes = useMemo(
    () => map.nodes.map((n) => (layout[n.id] ? { ...n, x: layout[n.id]!.x, y: layout[n.id]!.y } : n)),
    [map.nodes, layout],
  );
  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

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

  // Coverage this configuration generates over the active schedule's week.
  const coverage = useMemo<{ metrics: MapCoverage; skipped: string[] }>(() => {
    const schedule = db.schedules[0];
    if (!showCoverage || !schedule) {
      return { metrics: { byScheduleType: {}, byPosition: {}, byTask: {}, totalWindows: 0, totalSlots: 0 }, skipped: [] };
    }
    const dates: string[] = [];
    for (let d = schedule.startDate; d <= schedule.endDate; d = addDays(d, 1)) dates.push(d);
    const { requirements, skipped } = buildCoverageRequirements({
      positions: db.positions,
      tasks: db.tasks,
      operatingHours: db.operatingHours,
      dates,
    });
    return { metrics: mapCoverageMetrics(requirements), skipped };
  }, [showCoverage, db.schedules, db.positions, db.tasks, db.operatingHours]);

  // Staffing gaps: which generated windows the current staff cannot cover.
  const gaps = useMemo(() => {
    const schedule = db.schedules[0];
    if (!showGaps || !schedule) return null;
    return store.analyzeCoverageGaps(schedule.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showGaps, db.schedules, db.positions, db.tasks, db.operatingHours, db.employees, db.availability, db.shifts, db.coverage]);

  if (!canManage(currentUser)) {
    return <div className="empty-state">You do not have access to this section.</div>;
  }

  function coverageFor(node: MapNode): NodeCoverage | undefined {
    if (node.kind === "scheduleType") return coverage.metrics.byScheduleType[node.entityId];
    if (node.kind === "position") return coverage.metrics.byPosition[node.entityId];
    return coverage.metrics.byTask[node.entityId];
  }
  function gapFor(node: MapNode): number {
    if (!gaps) return 0;
    if (node.kind === "scheduleType") return gaps.byScheduleType[node.entityId] ?? 0;
    if (node.kind === "position") return gaps.byPosition[node.entityId] ?? 0;
    return gaps.byTask[node.entityId] ?? 0;
  }

  function toMapCoords(clientX: number, clientY: number): { x: number; y: number } {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: (clientX - rect.left - pan.x) / zoom, y: (clientY - rect.top - pan.y) / zoom };
  }
  function nodeAt(mx: number, my: number): MapNode | undefined {
    return nodes.find(
      (n) => mx >= n.x && mx <= n.x + MAP_LAYOUT.nodeWidth && my >= n.y && my <= n.y + MAP_LAYOUT.nodeHeight,
    );
  }
  // Left-to-right flow: schedule types feed positions and tasks; positions feed tasks.
  function canLink(fromKind: MapNode["kind"], toKind: MapNode["kind"]): boolean {
    if (fromKind === "scheduleType") return toKind === "position" || toKind === "task";
    if (fromKind === "position") return toKind === "task";
    return false;
  }
  function createLink(from: { kind: MapNode["kind"]; entityId: string }, to: MapNode) {
    if (from.kind === "scheduleType" && to.kind === "position") {
      const pos = db.positions.find((p) => p.id === to.entityId);
      if (!pos) return;
      const next = [...new Set([...positionScheduleTypeIds(pos), from.entityId])];
      store.upsertPosition({ ...pos, applicableLocationIds: next, locationId: next[0] });
    } else if (from.kind === "scheduleType" && to.kind === "task") {
      const task = db.tasks.find((t) => t.id === to.entityId);
      if (!task) return;
      store.upsertTask({ ...task, applicableLocationIds: [...new Set([...task.applicableLocationIds, from.entityId])] });
    } else if (from.kind === "position" && to.kind === "task") {
      const task = db.tasks.find((t) => t.id === to.entityId);
      if (!task) return;
      store.upsertTask({ ...task, applicablePositionIds: [...new Set([...task.applicablePositionIds, from.entityId])] });
    }
  }
  function onHandleMouseDown(e: React.MouseEvent, node: MapNode) {
    e.stopPropagation();
    setLink({ fromId: node.id, fromKind: node.kind, fromEntityId: node.entityId });
    setLinkCursor(toMapCoords(e.clientX, e.clientY));
    setLinkTarget(null);
  }

  function onStageMouseDown(e: React.MouseEvent) {
    drag.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  }
  function onStageMouseMove(e: React.MouseEvent) {
    if (link) {
      const c = toMapCoords(e.clientX, e.clientY);
      setLinkCursor(c);
      const target = nodeAt(c.x, c.y);
      setLinkTarget(target && target.id !== link.fromId && canLink(link.fromKind, target.kind) ? target.id : null);
      return;
    }
    if (nodeDrag.current) {
      const nd = nodeDrag.current;
      const dx = (e.clientX - nd.startX) / zoom;
      const dy = (e.clientY - nd.startY) / zoom;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) nd.moved = true;
      setLayout((l) => ({ ...l, [nd.id]: { x: nd.origX + dx, y: nd.origY + dy } }));
      return;
    }
    if (!drag.current) return;
    setPan({ x: drag.current.panX + (e.clientX - drag.current.x), y: drag.current.panY + (e.clientY - drag.current.y) });
  }
  function endDrag(e?: React.MouseEvent) {
    if (link) {
      if (e) {
        const c = toMapCoords(e.clientX, e.clientY);
        const target = nodeAt(c.x, c.y);
        if (target && target.id !== link.fromId && canLink(link.fromKind, target.kind)) {
          createLink({ kind: link.fromKind, entityId: link.fromEntityId }, target);
        }
      }
      setLink(null);
      setLinkCursor(null);
      setLinkTarget(null);
      drag.current = null;
      return;
    }
    if (nodeDrag.current) {
      const moved = nodeDrag.current.moved;
      nodeDrag.current = null;
      movedRef.current = moved;
      if (moved) {
        setLayout((l) => {
          try {
            window.localStorage.setItem(layoutKey, JSON.stringify(l));
          } catch {
            /* ignore quota */
          }
          return l;
        });
      }
    }
    drag.current = null;
  }
  function onNodeMouseDown(e: React.MouseEvent, node: MapNode) {
    e.stopPropagation();
    const eff = nodeById.get(node.id);
    if (!eff) return;
    nodeDrag.current = { id: node.id, startX: e.clientX, startY: e.clientY, origX: eff.x, origY: eff.y, moved: false };
  }
  function onNodeClick(node: MapNode) {
    // A completed drag suppresses the trailing click so it doesn't also select.
    if (movedRef.current) {
      movedRef.current = false;
      return;
    }
    setSelected({ kind: node.kind, id: node.entityId });
  }
  function resetLayout() {
    setLayout({});
    try {
      window.localStorage.removeItem(layoutKey);
    } catch {
      /* ignore */
    }
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
          A live view of the scheduling logic — how schedule types, positions, and tasks connect. Drag nodes to
          arrange them (saved per admin), or drag a node&rsquo;s handle onto another to link them. Changes here write
          straight to the catalog, so the Positions, Tasks, and Schedule types screens stay in sync.
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
        <div className="row" style={{ gap: "0.3rem", flexWrap: "wrap" }}>
          <button type="button" className={`button sm${showCoverage ? " primary" : ""}`} aria-pressed={showCoverage} onClick={() => setShowCoverage((c) => !c)}>
            Coverage
          </button>
          <button type="button" className={`button sm${showGaps ? " primary" : ""}`} aria-pressed={showGaps} onClick={() => setShowGaps((g) => !g)}>
            Gaps
          </button>
          <button type="button" className="button sm" onClick={resetLayout}>Reset layout</button>
          <button type="button" className="button sm" onClick={() => setZoom((z) => Math.max(0.4, z - 0.1))} aria-label="Zoom out">−</button>
          <button type="button" className="button sm" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>Reset view</button>
          <button type="button" className="button sm" onClick={() => setZoom((z) => Math.min(1.8, z + 0.1))} aria-label="Zoom in">+</button>
        </div>
      </div>

      {showCoverage && (
        <p className="muted" style={{ margin: "-0.25rem 0 0", fontSize: "0.84rem" }}>
          {coverage.metrics.totalWindows > 0 ? (
            <>
              Generates <strong>{coverage.metrics.totalWindows}</strong> coverage window{coverage.metrics.totalWindows === 1 ? "" : "s"} ·{" "}
              <strong>{coverage.metrics.totalSlots}</strong> staffing slot{coverage.metrics.totalSlots === 1 ? "" : "s"} per week.
              {" "}Numbers on nodes are windows/week.
            </>
          ) : (
            <>No coverage generated yet — set a frequency on positions or tasks (click a node) to see what they generate.</>
          )}
          {coverage.skipped.length > 0 && <> · <span className="badge warn">{coverage.skipped.length} not placeable</span></>}
        </p>
      )}

      {showGaps && gaps && (
        <p className="muted" style={{ margin: "-0.15rem 0 0", fontSize: "0.84rem" }}>
          {gaps.total > 0 ? (
            <>
              <span className="badge err">{gaps.total}</span> staffing slot{gaps.total === 1 ? "" : "s"} per week can&rsquo;t be
              covered by the current staff &amp; availability. Red numbers on nodes are unstaffable slots.
            </>
          ) : (
            <>Current staff can cover every generated window. 🎉</>
          )}
        </p>
      )}

      <div className={`smap-layout${selected ? " has-panel" : ""}`}>
        <div
          ref={stageRef}
          className={`smap-stage${link ? " is-linking" : ""}`}
          onMouseDown={onStageMouseDown}
          onMouseMove={onStageMouseMove}
          onMouseUp={(e) => endDrag(e)}
          onMouseLeave={() => endDrag()}
          onWheel={onWheel}
          role="application"
          aria-label="Schedule map canvas — drag to pan, scroll to zoom, drag a node's handle onto another to link them"
        >
          <div
            className="smap-viewport"
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, width: map.width, height: map.height }}
          >
            {COLUMN_HEADERS.map(({ kind, label, index }) => (
              <div key={kind} className="smap-colhead" style={{ left: columnHeaderX(index), width: MAP_LAYOUT.nodeWidth }}>
                {label}
              </div>
            ))}

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
              {link && linkCursor && nodeById.get(link.fromId) && (
                <path
                  className="smap-edge is-temp"
                  d={edgePath(nodeRightAnchor(nodeById.get(link.fromId)!), linkCursor)}
                  fill="none"
                />
              )}
            </svg>

            {nodes.map((node) => {
              const isSelected = node.id === selectedNodeId;
              const dim = selectedNodeId ? !connectedNodeIds.has(node.id) : false;
              const cov = showCoverage ? coverageFor(node) : undefined;
              const gap = showGaps ? gapFor(node) : 0;
              const isTarget = linkTarget === node.id;
              const canConnect = node.kind === "scheduleType" || node.kind === "position";
              return (
                <button
                  key={node.id}
                  type="button"
                  className={`smap-node is-${node.kind}${isSelected ? " is-selected" : ""}${dim ? " is-dim" : ""}${node.active ? "" : " is-inactive"}${isTarget ? " is-linktarget" : ""}`}
                  style={{ left: node.x, top: node.y, width: MAP_LAYOUT.nodeWidth, height: MAP_LAYOUT.nodeHeight }}
                  onMouseDown={(e) => onNodeMouseDown(e, node)}
                  onClick={() => onNodeClick(node)}
                >
                  {(gap > 0 || (cov && cov.windows > 0)) && (
                    <span className="smap-node-pills">
                      {gap > 0 && (
                        <span className="smap-pill is-gap" title={`${gap} staffing slot${gap === 1 ? "" : "s"} per week the current staff can't cover`}>
                          {gap} gap
                        </span>
                      )}
                      {cov && cov.windows > 0 && (
                        <span className="smap-pill is-cov" title={`${cov.windows} coverage window${cov.windows === 1 ? "" : "s"} · ${cov.slots} staffing slot${cov.slots === 1 ? "" : "s"} per week`}>
                          {cov.windows}/wk
                        </span>
                      )}
                    </span>
                  )}
                  <span className="smap-node-label">{node.label}</span>
                  <span className="smap-node-sub">
                    {node.sublabel}
                    {node.universal && <span className="badge info" style={{ marginLeft: "0.3rem" }}>all types</span>}
                    {!node.active && <span className="badge" style={{ marginLeft: "0.3rem" }}>inactive</span>}
                  </span>
                  {canConnect && (
                    <span
                      className="smap-node-handle"
                      aria-hidden
                      title="Drag onto another node to link them"
                      onMouseDown={(e) => onHandleMouseDown(e, node)}
                    />
                  )}
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
