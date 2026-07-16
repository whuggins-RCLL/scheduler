import type { AvailabilityBlock, AvailabilityKind } from "./types";

export const AVAIL_SLOT_MINUTES = 30;
export const AVAIL_DAY_START = 8 * 60;
export const AVAIL_DAY_END = 21 * 60;
export const AVAIL_SLOTS = Array.from(
  { length: (AVAIL_DAY_END - AVAIL_DAY_START) / AVAIL_SLOT_MINUTES },
  (_, i) => AVAIL_DAY_START + i * AVAIL_SLOT_MINUTES,
);

export type AvailabilityCellMap = Record<string, AvailabilityKind>;

export function blocksToCells(blocks: AvailabilityBlock[]): AvailabilityCellMap {
  const cell: AvailabilityCellMap = {};
  for (const b of blocks) {
    for (const s of AVAIL_SLOTS) {
      if (s >= b.start && s < b.end) cell[`${b.weekday}-${s}`] = b.kind;
    }
  }
  return cell;
}

export function cellsToBlocks(cell: AvailabilityCellMap): AvailabilityBlock[] {
  const blocks: AvailabilityBlock[] = [];
  for (let day = 0; day < 7; day++) {
    let run: { start: number; kind: AvailabilityKind } | null = null;
    for (const s of AVAIL_SLOTS) {
      const raw = cell[`${day}-${s}`];
      const active = raw && raw !== "unavailable" ? raw : null;
      if (run && run.kind !== active) {
        blocks.push({ weekday: day, start: run.start, end: s, kind: run.kind });
        run = null;
      }
      if (active && !run) run = { start: s, kind: active };
    }
    if (run) blocks.push({ weekday: day, start: run.start, end: AVAIL_DAY_END, kind: run.kind });
  }
  return blocks;
}

/** Approved slots as a boolean map keyed `${day}-${slot}`. */
export function approvedBlocksToSet(blocks: AvailabilityBlock[]): Set<string> {
  const set = new Set<string>();
  for (const b of blocks) {
    for (const s of AVAIL_SLOTS) {
      if (s >= b.start && s < b.end) set.add(`${b.weekday}-${s}`);
    }
  }
  return set;
}

export function approvedSetToBlocks(approved: Set<string>): AvailabilityBlock[] {
  const cell: AvailabilityCellMap = {};
  for (const key of approved) cell[key] = "available";
  return cellsToBlocks(cell);
}

export function isSlotSignedUp(
  blocks: AvailabilityBlock[],
  day: number,
  slot: number,
): boolean {
  const kind = blocksToCells(blocks)[`${day}-${slot}`];
  return kind === "available" || kind === "preferred";
}
