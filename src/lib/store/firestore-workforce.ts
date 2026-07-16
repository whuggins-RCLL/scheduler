/** Firestore bridge for live employee profiles and availability patterns. */
import {
  collection,
  deleteField,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  type DocumentData,
  type Query,
} from "firebase/firestore";
import type { AvailabilityPattern, EmployeeProfile, EmploymentClassification, WorkingHoursPattern } from "@/domain/types";
import { blocksToDaySchedules, normalizeWorkingDays } from "@/domain/working-hours";
import { ORGANIZATION_ID } from "@/lib/config";
import { getDb } from "@/lib/firebase";

function collectionPath(name: "employeeProfiles" | "availabilityPatterns" | "workingHoursPatterns") {
  return `organizations/${ORGANIZATION_ID}/${name}`;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

const CLASSIFICATIONS = new Set<EmploymentClassification>([
  "student_worker",
  "non_exempt_staff",
  "exempt_staff",
  "manager",
  "temporary",
  "casual",
  "other",
]);

function classification(value: unknown): EmploymentClassification {
  return typeof value === "string" && CLASSIFICATIONS.has(value as EmploymentClassification)
    ? value as EmploymentClassification
    : "other";
}

export function mapEmployeeProfile(id: string, data: DocumentData): EmployeeProfile {
  const notificationPrefs = data.notificationPrefs && typeof data.notificationPrefs === "object"
    ? data.notificationPrefs as DocumentData
    : {};
  return {
    id,
    legalName: String(data.legalName ?? data.email ?? "Unknown employee"),
    preferredName: typeof data.preferredName === "string" ? data.preferredName : undefined,
    email: String(data.email ?? "").trim().toLowerCase(),
    pronouns: typeof data.pronouns === "string" ? data.pronouns : undefined,
    employeeNumber: typeof data.employeeNumber === "string" ? data.employeeNumber : undefined,
    classification: classification(data.classification),
    departmentId: typeof data.departmentId === "string" ? data.departmentId : undefined,
    teamId: typeof data.teamId === "string" ? data.teamId : undefined,
    primaryLocationId: typeof data.primaryLocationId === "string" ? data.primaryLocationId : undefined,
    eligibleLocationIds: strings(data.eligibleLocationIds),
    primaryManagerId: typeof data.primaryManagerId === "string" ? data.primaryManagerId : undefined,
    additionalManagerIds: strings(data.additionalManagerIds),
    startDate: typeof data.startDate === "string" ? data.startDate : undefined,
    endDate: typeof data.endDate === "string" ? data.endDate : undefined,
    active: data.active === true,
    setupComplete: data.setupComplete === true,
    targetWeeklyHours: numberValue(data.targetWeeklyHours, 0),
    minWeeklyHours: numberValue(data.minWeeklyHours, 0),
    maxWeeklyHours: numberValue(data.maxWeeklyHours, 0),
    maxDailyHours: numberValue(data.maxDailyHours, 0),
    earliestStart: numberValue(data.earliestStart, 8 * 60),
    latestEnd: numberValue(data.latestEnd, 20 * 60),
    minTurnaroundMinutes: numberValue(data.minTurnaroundMinutes, 480),
    overtimeEligible: data.overtimeEligible === true,
    breakPolicyId: String(data.breakPolicyId ?? "ca-nonexempt-v1"),
    qualifiedPositionIds: strings(data.qualifiedPositionIds),
    qualifiedTaskIds: strings(data.qualifiedTaskIds),
    employmentPercentage: numberValue(data.employmentPercentage, 1),
    googleCalendarConnected: data.googleCalendarConnected === true,
    notificationPrefs: {
      inApp: notificationPrefs.inApp !== false,
      email: notificationPrefs.email !== false,
      calendar: notificationPrefs.calendar === true,
      quietHoursStart: typeof notificationPrefs.quietHoursStart === "number" ? notificationPrefs.quietHoursStart : undefined,
      quietHoursEnd: typeof notificationPrefs.quietHoursEnd === "number" ? notificationPrefs.quietHoursEnd : undefined,
      digest: notificationPrefs.digest === true,
    },
    managerNotes: typeof data.managerNotes === "string" ? data.managerNotes : undefined,
    employeeVisibleNotes: typeof data.employeeVisibleNotes === "string" ? data.employeeVisibleNotes : undefined,
  };
}

function toIso(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "toDate" in value) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return new Date().toISOString();
}

export function mapAvailabilityPattern(id: string, data: DocumentData): AvailabilityPattern {
  return {
    id,
    employeeId: String(data.employeeId ?? ""),
    effectiveStart: typeof data.effectiveStart === "string" ? data.effectiveStart : undefined,
    effectiveEnd: typeof data.effectiveEnd === "string" ? data.effectiveEnd : undefined,
    label: typeof data.label === "string" ? data.label : undefined,
    blocks: Array.isArray(data.blocks) ? data.blocks : [],
    note: typeof data.note === "string" ? data.note : undefined,
    mealBreakMinutes: data.mealBreakMinutes === 30 || data.mealBreakMinutes === 60 ? data.mealBreakMinutes : undefined,
    updatedBy: String(data.updatedBy ?? "system"),
    updatedAt: toIso(data.updatedAt),
  };
}

export function mapWorkingHoursPattern(id: string, data: DocumentData): WorkingHoursPattern {
  const legacyBlocks = Array.isArray(data.blocks) ? data.blocks : [];
  const days = Array.isArray(data.days)
    ? normalizeWorkingDays(data.days)
    : blocksToDaySchedules(legacyBlocks);
  return {
    id,
    employeeId: String(data.employeeId ?? ""),
    effectiveStart: typeof data.effectiveStart === "string" ? data.effectiveStart : undefined,
    effectiveEnd: typeof data.effectiveEnd === "string" ? data.effectiveEnd : undefined,
    label: typeof data.label === "string" ? data.label : undefined,
    days,
    note: typeof data.note === "string" ? data.note : undefined,
    updatedBy: String(data.updatedBy ?? "system"),
    updatedAt: toIso(data.updatedAt),
  };
}

export function subscribeEmployeeProfiles(
  onChange: (profiles: EmployeeProfile[]) => void,
  onError?: (error: unknown) => void,
  selfId?: string,
): () => void {
  const db = getDb();
  if (!db) return () => {};
  if (selfId) {
    return onSnapshot(
      doc(db, collectionPath("employeeProfiles"), selfId),
      (snapshot) => onChange(snapshot.exists() ? [mapEmployeeProfile(snapshot.id, snapshot.data())] : []),
      (error) => onError?.(error),
    );
  }
  return onSnapshot(
    collection(db, collectionPath("employeeProfiles")),
    (snapshot) => onChange(snapshot.docs.map((item) => mapEmployeeProfile(item.id, item.data()))),
    (error) => onError?.(error),
  );
}

export function subscribeAvailabilityPatterns(
  onChange: (patterns: AvailabilityPattern[]) => void,
  onError?: (error: unknown) => void,
  selfId?: string,
): () => void {
  const db = getDb();
  if (!db) return () => {};
  const base = collection(db, collectionPath("availabilityPatterns"));
  const target: Query<DocumentData> = selfId ? query(base, where("employeeId", "==", selfId)) : query(base);
  return onSnapshot(
    target,
    (snapshot) => onChange(snapshot.docs.map((item) => mapAvailabilityPattern(item.id, item.data()))),
    (error) => onError?.(error),
  );
}

function profilePayload(profile: EmployeeProfile): DocumentData {
  const payload: DocumentData = {
    legalName: profile.legalName,
    email: profile.email,
    classification: profile.classification,
    eligibleLocationIds: profile.eligibleLocationIds,
    additionalManagerIds: profile.additionalManagerIds,
    active: profile.active,
    setupComplete: profile.setupComplete === true,
    targetWeeklyHours: profile.targetWeeklyHours,
    minWeeklyHours: profile.minWeeklyHours,
    maxWeeklyHours: profile.maxWeeklyHours,
    maxDailyHours: profile.maxDailyHours,
    earliestStart: profile.earliestStart,
    latestEnd: profile.latestEnd,
    minTurnaroundMinutes: profile.minTurnaroundMinutes,
    overtimeEligible: profile.overtimeEligible,
    breakPolicyId: profile.breakPolicyId,
    qualifiedPositionIds: profile.qualifiedPositionIds,
    qualifiedTaskIds: profile.qualifiedTaskIds,
    employmentPercentage: profile.employmentPercentage,
    googleCalendarConnected: profile.googleCalendarConnected,
    notificationPrefs: profile.notificationPrefs,
    updatedAt: serverTimestamp(),
  };
  const optional: Array<keyof EmployeeProfile> = [
    "preferredName", "pronouns", "employeeNumber", "departmentId", "teamId", "primaryLocationId",
    "primaryManagerId", "startDate", "endDate", "managerNotes", "employeeVisibleNotes",
  ];
  for (const key of optional) payload[key] = profile[key] ?? deleteField();
  return payload;
}

export function subscribeWorkingHoursPatterns(
  onChange: (patterns: WorkingHoursPattern[]) => void,
  onError?: (error: unknown) => void,
  selfId?: string,
): () => void {
  const db = getDb();
  if (!db) return () => {};
  const base = collection(db, collectionPath("workingHoursPatterns"));
  const target: Query<DocumentData> = selfId ? query(base, where("employeeId", "==", selfId)) : query(base);
  return onSnapshot(
    target,
    (snapshot) => onChange(snapshot.docs.map((item) => mapWorkingHoursPattern(item.id, item.data()))),
    (error) => onError?.(error),
  );
}

export async function writeEmployeeProfile(profile: EmployeeProfile): Promise<void> {
  const db = getDb();
  if (!db) return;
  await setDoc(doc(db, collectionPath("employeeProfiles"), profile.id), profilePayload(profile), { merge: true });
}

export async function writeAvailabilityPattern(pattern: AvailabilityPattern): Promise<void> {
  const db = getDb();
  if (!db) return;
  const payload: DocumentData = {
    employeeId: pattern.employeeId,
    blocks: pattern.blocks,
    updatedBy: pattern.updatedBy,
    updatedAt: serverTimestamp(),
  };
  if (pattern.effectiveStart !== undefined) payload.effectiveStart = pattern.effectiveStart;
  if (pattern.effectiveEnd !== undefined) payload.effectiveEnd = pattern.effectiveEnd;
  if (pattern.label !== undefined) payload.label = pattern.label;
  if (pattern.note !== undefined) payload.note = pattern.note;
  if (pattern.mealBreakMinutes !== undefined) payload.mealBreakMinutes = pattern.mealBreakMinutes;
  await setDoc(doc(db, collectionPath("availabilityPatterns"), pattern.id), payload, { merge: true });
}

export async function writeWorkingHoursPattern(pattern: WorkingHoursPattern): Promise<void> {
  const db = getDb();
  if (!db) return;
  const payload: DocumentData = {
    employeeId: pattern.employeeId,
    days: normalizeWorkingDays(pattern.days),
    updatedBy: pattern.updatedBy,
    updatedAt: serverTimestamp(),
  };
  if (pattern.effectiveStart !== undefined) payload.effectiveStart = pattern.effectiveStart;
  if (pattern.effectiveEnd !== undefined) payload.effectiveEnd = pattern.effectiveEnd;
  if (pattern.label !== undefined) payload.label = pattern.label;
  if (pattern.note !== undefined) payload.note = pattern.note;
  await setDoc(doc(db, collectionPath("workingHoursPatterns"), pattern.id), payload, { merge: true });
}
