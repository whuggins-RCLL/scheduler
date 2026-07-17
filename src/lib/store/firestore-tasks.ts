/** Firestore bridge for the organization task catalog. */
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type DocumentData,
} from "firebase/firestore";
import type { Task, TaskPriority } from "@/domain/types";
import { normalizeFrequency } from "@/domain/frequency";
import { ORGANIZATION_ID } from "@/lib/config";
import { getDb } from "@/lib/firebase";

const PRIORITIES = new Set<TaskPriority>(["low", "normal", "high", "urgent"]);

function collectionPath() {
  return `organizations/${ORGANIZATION_ID}/tasks`;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function priority(value: unknown): TaskPriority {
  return typeof value === "string" && PRIORITIES.has(value as TaskPriority) ? value as TaskPriority : "normal";
}

export function mapTask(id: string, data: DocumentData): Task {
  return {
    id,
    name: String(data.name ?? ""),
    description: typeof data.description === "string" ? data.description : undefined,
    category: String(data.category ?? "General"),
    colorToken: String(data.colorToken ?? "task-neutral"),
    icon: String(data.icon ?? "check"),
    requiredQualification: typeof data.requiredQualification === "string" ? data.requiredQualification : undefined,
    applicableLocationIds: strings(data.applicableLocationIds),
    applicablePositionIds: strings(data.applicablePositionIds),
    estimatedMinutes: numberValue(data.estimatedMinutes, 30),
    priority: priority(data.priority),
    minAssignees: numberValue(data.minAssignees, 1),
    maxAssignees: numberValue(data.maxAssignees, 1),
    allowedDuringPosition: data.allowedDuringPosition !== false,
    requiresAcknowledgement: data.requiresAcknowledgement === true,
    checklist: strings(data.checklist),
    openingDependency: data.openingDependency === true,
    closingDependency: data.closingDependency === true,
    frequency: normalizeFrequency(data.frequency),
    order: numberValue(data.order, 0),
    active: data.active !== false,
  };
}

function taskPayload(task: Task): DocumentData {
  const payload: DocumentData = {
    name: task.name,
    category: task.category,
    colorToken: task.colorToken,
    icon: task.icon,
    applicableLocationIds: task.applicableLocationIds,
    applicablePositionIds: task.applicablePositionIds,
    estimatedMinutes: task.estimatedMinutes,
    priority: task.priority,
    minAssignees: task.minAssignees,
    maxAssignees: task.maxAssignees,
    allowedDuringPosition: task.allowedDuringPosition,
    requiresAcknowledgement: task.requiresAcknowledgement,
    checklist: task.checklist,
    openingDependency: task.openingDependency,
    closingDependency: task.closingDependency,
    order: task.order,
    active: task.active,
    updatedAt: serverTimestamp(),
  };
  if (task.description) payload.description = task.description;
  if (task.requiredQualification) payload.requiredQualification = task.requiredQualification;
  if (task.frequency) payload.frequency = task.frequency;
  return payload;
}

export function subscribeTasks(
  onChange: (tasks: Task[]) => void,
  onError?: (error: unknown) => void,
): () => void {
  const db = getDb();
  if (!db) return () => {};
  return onSnapshot(
    collection(db, collectionPath()),
    (snapshot) => onChange(snapshot.docs.map((item) => mapTask(item.id, item.data()))),
    (error) => onError?.(error),
  );
}

export async function writeTask(task: Task): Promise<void> {
  const db = getDb();
  if (!db) return;
  await setDoc(doc(db, collectionPath(), task.id), taskPayload(task), { merge: true });
}

export async function deleteTask(taskId: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  await deleteDoc(doc(db, collectionPath(), taskId));
}

/** Seed defaults into Firestore when the collection is empty. */
export async function bootstrapTasks(tasks: Task[]): Promise<void> {
  if (tasks.length === 0) return;
  await Promise.all(tasks.map((task) => writeTask(task)));
}
