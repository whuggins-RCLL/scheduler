/** Firestore bridge for personal availability exceptions (leave records). */
import {
  collection,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  doc,
  where,
  type DocumentData,
  type Query,
} from "firebase/firestore";
import type { LeaveRecord, LeaveStatus } from "@/domain/types";
import { ORGANIZATION_ID } from "@/lib/config";
import { getDb } from "@/lib/firebase";

function collectionPath() {
  return `organizations/${ORGANIZATION_ID}/leaveRecords`;
}

function toIso(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "toDate" in value) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return new Date().toISOString();
}

const STATUSES = new Set<LeaveStatus>(["requested", "approved", "denied", "cancelled", "recorded"]);

function status(value: unknown): LeaveStatus {
  return typeof value === "string" && STATUSES.has(value as LeaveStatus)
    ? (value as LeaveStatus)
    : "recorded";
}

export function mapLeaveRecord(id: string, data: DocumentData): LeaveRecord {
  return {
    id,
    employeeId: String(data.employeeId ?? ""),
    leaveTypeId: String(data.leaveTypeId ?? "lt-unavailable"),
    startDate: String(data.startDate ?? ""),
    endDate: String(data.endDate ?? data.startDate ?? ""),
    partialDay: data.partialDay === true,
    start: typeof data.start === "number" ? data.start : undefined,
    end: typeof data.end === "number" ? data.end : undefined,
    status: status(data.status),
    note: typeof data.note === "string" ? data.note : undefined,
    globalExceptionId: typeof data.globalExceptionId === "string" ? data.globalExceptionId : undefined,
    enteredBy: String(data.enteredBy ?? "system"),
    decidedBy: typeof data.decidedBy === "string" ? data.decidedBy : undefined,
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  };
}

/**
 * Live subscription to personal exceptions. Managers/staff read the whole
 * collection; an ordinary user is scoped to their own records by `employeeId`
 * (matching the `owns(resource.data.employeeId)` read rule). University-wide
 * holidays are NOT stored here — they are derived from global exceptions and
 * re-materialized on load, so this collection holds personal records only.
 */
export function subscribeLeaveRecords(
  onChange: (records: LeaveRecord[]) => void,
  onError?: (error: unknown) => void,
  selfId?: string,
): () => void {
  const db = getDb();
  if (!db) return () => {};
  const base = collection(db, collectionPath());
  const target: Query<DocumentData> = selfId ? query(base, where("employeeId", "==", selfId)) : query(base);
  return onSnapshot(
    target,
    (snapshot) => onChange(snapshot.docs.map((item) => mapLeaveRecord(item.id, item.data()))),
    (error) => onError?.(error),
  );
}

export async function writeLeaveRecord(record: LeaveRecord): Promise<void> {
  const db = getDb();
  if (!db) return;
  const payload: DocumentData = {
    employeeId: record.employeeId,
    leaveTypeId: record.leaveTypeId,
    startDate: record.startDate,
    endDate: record.endDate,
    partialDay: record.partialDay,
    status: record.status,
    enteredBy: record.enteredBy,
    createdAt: record.createdAt || serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (record.partialDay && typeof record.start === "number") payload.start = record.start;
  if (record.partialDay && typeof record.end === "number") payload.end = record.end;
  if (record.note !== undefined) payload.note = record.note;
  if (record.globalExceptionId !== undefined) payload.globalExceptionId = record.globalExceptionId;
  if (record.decidedBy !== undefined) payload.decidedBy = record.decidedBy;
  await setDoc(doc(db, collectionPath(), record.id), payload, { merge: true });
}
