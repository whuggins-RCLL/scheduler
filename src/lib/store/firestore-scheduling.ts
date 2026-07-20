/**
 * Firestore bridge for the scheduling core: schedules and shifts.
 *
 * Mirrors the other firestore-* modules (map / subscribe / write). Two
 * deliberate choices keep the reactive diff-sync in StoreProvider echo-safe:
 *   - payloads store `updatedAt` as the domain object's own ISO string (never a
 *     serverTimestamp), so a write and the snapshot it echoes back are byte-for-
 *     byte identical and never trigger a re-write loop;
 *   - map* is the exact inverse of *Payload over the fields the sync signs.
 *
 * Neither schedules nor shifts are ever deleted (firestore.rules forbids it and
 * historical records are retained) — removals happen via status = "cancelled".
 */
import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  writeBatch,
  type DocumentData,
} from "firebase/firestore";
import type { Break, Schedule, Shift, ShiftSource, ShiftStatus } from "@/domain/types";
import { ORGANIZATION_ID } from "@/lib/config";
import { getDb } from "@/lib/firebase";

function collectionPath(name: "schedules" | "shifts"): string {
  return `organizations/${ORGANIZATION_ID}/${name}`;
}

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}
function iso(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "toDate" in value) {
    try {
      return (value as { toDate: () => Date }).toDate().toISOString();
    } catch {
      return "";
    }
  }
  return "";
}

const SCHEDULE_STATUSES = new Set(["draft", "published", "archived"]);
const SHIFT_STATUSES = new Set<ShiftStatus>([
  "draft", "proposed", "published", "acknowledged", "in_progress",
  "completed", "cancelled", "open", "swap_pending", "coverage_needed",
]);
const SHIFT_SOURCES = new Set<ShiftSource>([
  "template_generated", "manager_created", "employee_claimed", "shift_swap", "imported",
]);

// --------------------------------------------------------------------------
// Schedules
// --------------------------------------------------------------------------

export function mapSchedule(id: string, data: DocumentData): Schedule {
  const status = SCHEDULE_STATUSES.has(str(data.status)) ? (data.status as Schedule["status"]) : "draft";
  return {
    id,
    name: str(data.name, "Schedule"),
    startDate: str(data.startDate),
    endDate: str(data.endDate),
    status,
    version: num(data.version, 1),
    publishedVersion: typeof data.publishedVersion === "number" ? data.publishedVersion : undefined,
    createdBy: str(data.createdBy, "system"),
    createdAt: iso(data.createdAt),
    updatedAt: iso(data.updatedAt),
  };
}

function schedulePayload(s: Schedule): DocumentData {
  return {
    name: s.name,
    startDate: s.startDate,
    endDate: s.endDate,
    status: s.status,
    version: s.version,
    publishedVersion: s.publishedVersion,
    createdBy: s.createdBy,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt, // ISO string, not serverTimestamp — see file header
    // Server-side audit only; ignored by mapSchedule and the sync signature.
    _syncedAt: serverTimestamp(),
  };
}

export function subscribeSchedules(
  onChange: (schedules: Schedule[]) => void,
  onError?: (error: unknown) => void,
): () => void {
  const db = getDb();
  if (!db) return () => {};
  return onSnapshot(
    collection(db, collectionPath("schedules")),
    (snap) => onChange(snap.docs.map((d) => mapSchedule(d.id, d.data()))),
    (error) => onError?.(error),
  );
}

export async function writeSchedule(schedule: Schedule): Promise<void> {
  const db = getDb();
  if (!db) return;
  await setDoc(doc(db, collectionPath("schedules"), schedule.id), schedulePayload(schedule), { merge: true });
}

// --------------------------------------------------------------------------
// Shifts
// --------------------------------------------------------------------------

function breaks(value: unknown): Break[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((b): b is DocumentData => !!b && typeof b === "object")
    .map((b) => ({
      kind: b.kind === "meal" ? "meal" : "rest",
      start: num(b.start, 0),
      end: num(b.end, 0),
      paid: b.paid === true,
    }));
}

export function mapShift(id: string, data: DocumentData): Shift {
  return {
    id,
    scheduleId: str(data.scheduleId),
    employeeId: typeof data.employeeId === "string" ? data.employeeId : null,
    positionId: str(data.positionId),
    locationId: str(data.locationId),
    date: str(data.date),
    start: num(data.start, 0),
    end: num(data.end, 0),
    breaks: breaks(data.breaks),
    taskIds: Array.isArray(data.taskIds) ? data.taskIds.filter((t: unknown): t is string => typeof t === "string") : [],
    status: SHIFT_STATUSES.has(str(data.status) as ShiftStatus) ? (data.status as ShiftStatus) : "draft",
    source: SHIFT_SOURCES.has(str(data.source) as ShiftSource) ? (data.source as ShiftSource) : "manager_created",
    notes: typeof data.notes === "string" ? data.notes : undefined,
    locked: data.locked === true,
    scheduleVersion: num(data.scheduleVersion, 1),
    createdAt: iso(data.createdAt),
    updatedAt: iso(data.updatedAt),
  };
}

function shiftPayload(s: Shift): DocumentData {
  return {
    scheduleId: s.scheduleId,
    employeeId: s.employeeId,
    positionId: s.positionId,
    locationId: s.locationId,
    date: s.date,
    start: s.start,
    end: s.end,
    breaks: s.breaks,
    taskIds: s.taskIds,
    status: s.status,
    source: s.source,
    notes: s.notes,
    locked: s.locked,
    scheduleVersion: s.scheduleVersion,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt, // ISO string, not serverTimestamp — see file header
    _syncedAt: serverTimestamp(),
  };
}

export function subscribeShifts(
  onChange: (shifts: Shift[]) => void,
  onError?: (error: unknown) => void,
): () => void {
  const db = getDb();
  if (!db) return () => {};
  // Phase 1: subscribe to the whole shifts collection. The library runs a
  // single active schedule at a time, so volume is small; scoping by active
  // schedule / date window is a future optimization (see the scope doc).
  return onSnapshot(
    collection(db, collectionPath("shifts")),
    (snap) => onChange(snap.docs.map((d) => mapShift(d.id, d.data()))),
    (error) => onError?.(error),
  );
}

/** Firestore caps a batch at 500 writes; stay comfortably under. */
const BATCH_LIMIT = 450;

/** Write many shifts in chunked batches (used by generation/publish). */
export async function writeShiftsBatch(shifts: Shift[]): Promise<void> {
  const db = getDb();
  if (!db || shifts.length === 0) return;
  for (let i = 0; i < shifts.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const shift of shifts.slice(i, i + BATCH_LIMIT)) {
      batch.set(doc(db, collectionPath("shifts"), shift.id), shiftPayload(shift), { merge: true });
    }
    await batch.commit();
  }
}
