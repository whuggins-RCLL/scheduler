/**
 * Pure builder for the admin schedule mind-map: turns the current schedule
 * types, positions, and tasks into a laid-out node/edge graph the visualization
 * renders. Kept free of React so the layout and relationships are unit-testable.
 *
 * Layered left-to-right flow: Schedule types → Positions → Tasks. Edges encode
 * the assignment logic the scheduler relies on:
 *   - a position is staffed on a schedule type (`applicableLocationIds`)
 *   - a task runs on a schedule type (`applicableLocationIds`)
 *   - a task is hosted by a position (`applicablePositionIds`)
 */
import type { Location, Position, Task } from "@/domain/types";
import type { CoverageRequirement } from "@/domain/scheduling";
import { describeFrequency } from "@/domain/frequency";
import { positionScheduleTypeIds } from "@/lib/schedule-type-links";

export type MapNodeKind = "scheduleType" | "position" | "task";

export interface MapNode {
  id: string; // graph id, unique across kinds
  entityId: string; // underlying location/position/task id
  kind: MapNodeKind;
  label: string;
  sublabel: string;
  active: boolean;
  /** Task that applies to every schedule type (no explicit links). */
  universal?: boolean;
  x: number;
  y: number;
}

export type MapEdgeKind = "type-position" | "position-task" | "type-task";

export interface MapEdge {
  id: string;
  from: string; // source node id
  to: string; // target node id
  kind: MapEdgeKind;
}

export interface ScheduleMap {
  nodes: MapNode[];
  edges: MapEdge[];
  width: number;
  height: number;
}

export const MAP_LAYOUT = {
  nodeWidth: 190,
  nodeHeight: 58,
  colGap: 130,
  rowGap: 18,
  pad: 24,
} as const;

const COLUMN_INDEX: Record<MapNodeKind, number> = {
  scheduleType: 0,
  position: 1,
  task: 2,
};

function columnX(kind: MapNodeKind): number {
  const { nodeWidth, colGap, pad } = MAP_LAYOUT;
  return pad + COLUMN_INDEX[kind] * (nodeWidth + colGap);
}

function rowY(index: number): number {
  const { nodeHeight, rowGap, pad } = MAP_LAYOUT;
  return pad + index * (nodeHeight + rowGap);
}

export function nodeId(kind: MapNodeKind, entityId: string): string {
  return `${kind}:${entityId}`;
}

export function buildScheduleMap(input: {
  locations: Location[];
  positions: Position[];
  tasks: Task[];
}): ScheduleMap {
  const types = [...input.locations].sort((a, b) => a.name.localeCompare(b.name));
  const positions = [...input.positions].sort((a, b) => a.order - b.order);
  const tasks = [...input.tasks].sort((a, b) => a.order - b.order);

  const nodes: MapNode[] = [];
  const present = new Set<string>();

  types.forEach((loc, i) => {
    const id = nodeId("scheduleType", loc.id);
    present.add(id);
    nodes.push({
      id,
      entityId: loc.id,
      kind: "scheduleType",
      label: loc.name,
      sublabel: `min ${loc.minStaffing} · ${loc.shortName}`,
      active: loc.active,
      x: columnX("scheduleType"),
      y: rowY(i),
    });
  });

  positions.forEach((pos, i) => {
    const id = nodeId("position", pos.id);
    present.add(id);
    const staffing = pos.unlimitedSeating
      ? "∞ seats"
      : `${pos.minStaffing}/${pos.preferredStaffing}/${pos.maxStaffing}`;
    nodes.push({
      id,
      entityId: pos.id,
      kind: "position",
      label: pos.name || "Untitled position",
      sublabel: `${staffing} · ${describeFrequency(pos.frequency)}`,
      active: pos.active,
      x: columnX("position"),
      y: rowY(i),
    });
  });

  tasks.forEach((task, i) => {
    const id = nodeId("task", task.id);
    present.add(id);
    nodes.push({
      id,
      entityId: task.id,
      kind: "task",
      label: task.name || "Untitled task",
      sublabel: describeFrequency(task.frequency),
      active: task.active,
      universal: task.applicableLocationIds.length === 0,
      x: columnX("task"),
      y: rowY(i),
    });
  });

  const edges: MapEdge[] = [];
  const addEdge = (from: string, to: string, kind: MapEdgeKind) => {
    if (!present.has(from) || !present.has(to)) return;
    edges.push({ id: `${kind}:${from}->${to}`, from, to, kind });
  };

  for (const pos of positions) {
    for (const locId of positionScheduleTypeIds(pos)) {
      addEdge(nodeId("scheduleType", locId), nodeId("position", pos.id), "type-position");
    }
  }

  for (const task of tasks) {
    // A task with no explicit schedule types applies everywhere; it's badged as
    // universal rather than wired to every type (which would flood the canvas).
    for (const locId of task.applicableLocationIds) {
      addEdge(nodeId("scheduleType", locId), nodeId("task", task.id), "type-task");
    }
    for (const posId of task.applicablePositionIds) {
      addEdge(nodeId("position", posId), nodeId("task", task.id), "position-task");
    }
  }

  const columnCounts = [types.length, positions.length, tasks.length];
  const rows = Math.max(1, ...columnCounts);
  const { nodeWidth, nodeHeight, colGap, pad } = MAP_LAYOUT;
  const width = pad * 2 + 3 * nodeWidth + 2 * colGap;
  const height = pad * 2 + rows * nodeHeight + (rows - 1) * MAP_LAYOUT.rowGap;

  return { nodes, edges, width, height };
}

/** Anchor point on a node's right edge (edge source). */
export function nodeRightAnchor(node: MapNode): { x: number; y: number } {
  return { x: node.x + MAP_LAYOUT.nodeWidth, y: node.y + MAP_LAYOUT.nodeHeight / 2 };
}

/** Anchor point on a node's left edge (edge target). */
export function nodeLeftAnchor(node: MapNode): { x: number; y: number } {
  return { x: node.x, y: node.y + MAP_LAYOUT.nodeHeight / 2 };
}

/** Cubic bezier path between two anchors, bowed horizontally for a clean flow. */
export function edgePath(from: { x: number; y: number }, to: { x: number; y: number }): string {
  const dx = Math.max(40, Math.abs(to.x - from.x) * 0.4);
  return `M ${from.x} ${from.y} C ${from.x + dx} ${from.y}, ${to.x - dx} ${to.y}, ${to.x} ${to.y}`;
}

export interface NodeCoverage {
  windows: number; // number of coverage windows generated
  slots: number; // total headcount across those windows
}

export interface MapCoverage {
  byScheduleType: Record<string, NodeCoverage>;
  byPosition: Record<string, NodeCoverage>;
  byTask: Record<string, NodeCoverage>;
  totalWindows: number;
  totalSlots: number;
}

/**
 * Attribute derived coverage requirements to the map's nodes. Every requirement
 * counts toward its schedule type; task requirements (those carrying a task id)
 * count toward that task, and post-coverage requirements (no task) count toward
 * their host position. This is what each node "generates" over the range.
 */
export function mapCoverageMetrics(requirements: CoverageRequirement[]): MapCoverage {
  const byScheduleType: Record<string, NodeCoverage> = {};
  const byPosition: Record<string, NodeCoverage> = {};
  const byTask: Record<string, NodeCoverage> = {};
  let totalWindows = 0;
  let totalSlots = 0;

  const bump = (bucket: Record<string, NodeCoverage>, key: string, slots: number) => {
    const entry = bucket[key] ?? { windows: 0, slots: 0 };
    entry.windows += 1;
    entry.slots += slots;
    bucket[key] = entry;
  };

  for (const req of requirements) {
    totalWindows += 1;
    totalSlots += req.count;
    bump(byScheduleType, req.locationId, req.count);
    const taskId = req.taskIds && req.taskIds.length > 0 ? req.taskIds[0]! : undefined;
    if (taskId) bump(byTask, taskId, req.count);
    else bump(byPosition, req.positionId, req.count);
  }

  return { byScheduleType, byPosition, byTask, totalWindows, totalSlots };
}
