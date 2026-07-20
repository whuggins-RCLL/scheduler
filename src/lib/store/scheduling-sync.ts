/**
 * Pure diff for the reactive scheduling sync. StoreProvider holds a snapshot of
 * what Firestore already has (id → signature); on every change to the in-memory
 * schedules/shifts it computes which docs are new-or-changed and writes only
 * those. Subscription-delivered docs update the snapshot without a write, so
 * echoes never loop.
 *
 * No deletes: schedules/shifts are never removed (rules forbid it; removal is a
 * status change), so the diff only ever produces writes.
 */

import type { Schedule, Shift } from "@/domain/types";

export type SyncSnapshot = Map<string, string>;

/**
 * Compact, order-stable signature of the fields that matter for a write. Any
 * real mutation bumps `updatedAt`; the extra fields are belt-and-suspenders
 * against a mutation that forgets to. Must stay in sync with what
 * `mapSchedule`/`mapShift` reconstruct, so a write and its echo hash equal.
 */
export function scheduleSignature(s: Schedule): string {
  return [s.id, s.name, s.startDate, s.endDate, s.status, s.version, s.publishedVersion ?? "", s.updatedAt].join("|");
}

export function shiftSignature(s: Shift): string {
  return [
    s.id,
    s.scheduleId,
    s.employeeId ?? "",
    s.positionId,
    s.locationId,
    s.date,
    s.start,
    s.end,
    s.status,
    s.locked ? 1 : 0,
    s.scheduleVersion,
    s.taskIds.join(","),
    // Field-by-field (not JSON) so object key order can't cause spurious writes.
    s.breaks.map((b) => `${b.kind}:${b.start}-${b.end}:${b.paid ? 1 : 0}`).join(";"),
    s.notes ?? "",
    s.updatedAt,
  ].join("|");
}

export interface SyncDiff<T> {
  /** Docs that are new or whose signature changed — the writes to perform. */
  writes: T[];
  /** The snapshot to keep after these writes land. */
  next: SyncSnapshot;
}

/**
 * Diff the current items against the last-known snapshot. Returns the docs to
 * write and the updated snapshot. Pure — the caller performs the writes and
 * stores `next`.
 */
export function diffForSync<T extends { id: string }>(
  snapshot: SyncSnapshot,
  items: T[],
  signature: (item: T) => string,
): SyncDiff<T> {
  const writes: T[] = [];
  const next: SyncSnapshot = new Map();
  for (const item of items) {
    const sig = signature(item);
    next.set(item.id, sig);
    if (snapshot.get(item.id) !== sig) writes.push(item);
  }
  return { writes, next };
}

/** Build a snapshot from items delivered by a subscription (no writes implied). */
export function snapshotOf<T extends { id: string }>(items: T[], signature: (item: T) => string): SyncSnapshot {
  const snap: SyncSnapshot = new Map();
  for (const item of items) snap.set(item.id, signature(item));
  return snap;
}
