/** Firestore bridge for organization-wide global exceptions (holidays/closures). */
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type DocumentData,
} from "firebase/firestore";
import type { GlobalException } from "@/domain/types";
import { ORGANIZATION_ID } from "@/lib/config";
import { getDb } from "@/lib/firebase";

function collectionPath() {
  return `organizations/${ORGANIZATION_ID}/globalExceptions`;
}

function toIso(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "toDate" in value) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return new Date().toISOString();
}

export function mapGlobalException(id: string, data: DocumentData): GlobalException {
  return {
    id,
    name: String(data.name ?? "University holiday"),
    startDate: String(data.startDate ?? ""),
    endDate: String(data.endDate ?? data.startDate ?? ""),
    note: typeof data.note === "string" ? data.note : undefined,
    createdBy: String(data.createdBy ?? "system"),
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  };
}

export function subscribeGlobalExceptions(
  onChange: (exceptions: GlobalException[]) => void,
  onError?: (error: unknown) => void,
): () => void {
  const db = getDb();
  if (!db) return () => {};
  return onSnapshot(
    collection(db, collectionPath()),
    (snapshot) => onChange(snapshot.docs.map((item) => mapGlobalException(item.id, item.data()))),
    (error) => onError?.(error),
  );
}

export async function writeGlobalException(exception: GlobalException): Promise<void> {
  const db = getDb();
  if (!db) return;
  const payload: DocumentData = {
    name: exception.name,
    startDate: exception.startDate,
    endDate: exception.endDate,
    createdBy: exception.createdBy,
    createdAt: exception.createdAt || serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (exception.note) payload.note = exception.note;
  await setDoc(doc(db, collectionPath(), exception.id), payload, { merge: true });
}

export async function deleteGlobalExceptionDoc(exceptionId: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  await deleteDoc(doc(db, collectionPath(), exceptionId));
}

/** Seed defaults into Firestore when the collection is empty. */
export async function bootstrapGlobalExceptions(exceptions: GlobalException[]): Promise<void> {
  if (exceptions.length === 0) return;
  await Promise.all(exceptions.map((exception) => writeGlobalException(exception)));
}
