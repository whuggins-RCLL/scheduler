/** Firestore bridge for org configuration: positions, schedule types (locations), departments. */
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type DocumentData,
} from "firebase/firestore";
import type { Department, EmploymentClassification, Location, Position } from "@/domain/types";
import { normalizeFrequency } from "@/domain/frequency";
import { DEFAULT_TIMEZONE, ORGANIZATION_ID } from "@/lib/config";
import { getDb } from "@/lib/firebase";
import { seedLocations } from "./seed";

const CLASSIFICATIONS = new Set<EmploymentClassification>([
  "student_worker",
  "non_exempt_staff",
  "exempt_staff",
  "manager",
  "temporary",
  "casual",
  "other",
]);

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function classification(value: unknown): EmploymentClassification {
  return typeof value === "string" && CLASSIFICATIONS.has(value as EmploymentClassification)
    ? value as EmploymentClassification
    : "other";
}

function orgPath(name: "positions" | "locations" | "departments") {
  return `organizations/${ORGANIZATION_ID}/${name}`;
}

export function mapPosition(id: string, data: DocumentData): Position {
  const locationId = typeof data.locationId === "string" ? data.locationId : undefined;
  const applicableLocationIds = strings(data.applicableLocationIds);
  return {
    id,
    name: String(data.name ?? ""),
    shortLabel: String(data.shortLabel ?? ""),
    description: typeof data.description === "string" ? data.description : undefined,
    colorToken: String(data.colorToken ?? "position-desk"),
    icon: String(data.icon ?? "desk"),
    locationId,
    applicableLocationIds: applicableLocationIds.length > 0
      ? applicableLocationIds
      : locationId ? [locationId] : [],
    departmentId: typeof data.departmentId === "string" ? data.departmentId : undefined,
    requiredQualification: typeof data.requiredQualification === "string" ? data.requiredQualification : undefined,
    minStaffing: numberValue(data.minStaffing, 1),
    preferredStaffing: numberValue(data.preferredStaffing, 1),
    maxStaffing: numberValue(data.maxStaffing, 2),
    unlimitedSeating: data.unlimitedSeating === true,
    minAssignmentMinutes: numberValue(data.minAssignmentMinutes, 60),
    maxContinuousMinutes: numberValue(data.maxContinuousMinutes, 120),
    requiresPhysicalPresence: data.requiresPhysicalPresence === true,
    blocksOtherAssignments: data.blocksOtherAssignments !== false,
    countsAsPublicService: data.countsAsPublicService === true,
    selfClaimable: data.selfClaimable === true,
    swapsAllowed: data.swapsAllowed !== false,
    eligibleClassifications: Array.isArray(data.eligibleClassifications)
      ? data.eligibleClassifications.filter((item): item is EmploymentClassification => classification(item) === item)
      : [],
    frequency: normalizeFrequency(data.frequency),
    order: numberValue(data.order, 0),
    active: data.active !== false,
  };
}

export function mapLocation(id: string, data: DocumentData): Location {
  return {
    id,
    name: String(data.name ?? ""),
    shortName: String(data.shortName ?? ""),
    description: typeof data.description === "string" ? data.description : undefined,
    timeZone: String(data.timeZone ?? DEFAULT_TIMEZONE),
    minStaffing: numberValue(data.minStaffing, 0),
    openBufferMinutes: numberValue(data.openBufferMinutes, 0),
    closeBufferMinutes: numberValue(data.closeBufferMinutes, 0),
    libcalId: typeof data.libcalId === "string" ? data.libcalId : undefined,
    active: data.active !== false,
  };
}

export function mapDepartment(id: string, data: DocumentData): Department {
  return {
    id,
    name: String(data.name ?? ""),
    active: data.active !== false,
  };
}

/**
 * Merge Firestore schedule types with the built-in seed set. Firestore is
 * authoritative for any doc it returns; missing seed ids are filled from seed
 * so partial collections (e.g. only `loc-main`) do not wipe Desk/Stacks/Breaks.
 */
export function mergeLocationsWithSeed(firestoreLocations: Location[]): Location[] {
  const byId = new Map(firestoreLocations.map((location) => [location.id, location]));
  const seed = seedLocations();
  const seedIds = new Set(seed.map((location) => location.id));
  for (const location of seed) {
    if (!byId.has(location.id)) byId.set(location.id, location);
  }
  return [
    ...seed.map((location) => byId.get(location.id)!),
    ...firestoreLocations.filter((location) => !seedIds.has(location.id)),
  ];
}

/** Seed schedule types absent from the Firestore snapshot (for admin bootstrap). */
export function missingSeedLocations(firestoreLocations: Location[]): Location[] {
  const existing = new Set(firestoreLocations.map((location) => location.id));
  return seedLocations().filter((location) => !existing.has(location.id));
}

function positionPayload(position: Position): DocumentData {
  const applicableLocationIds = position.applicableLocationIds?.length
    ? position.applicableLocationIds
    : position.locationId ? [position.locationId] : [];
  const payload: DocumentData = {
    name: position.name,
    shortLabel: position.shortLabel,
    colorToken: position.colorToken,
    icon: position.icon,
    applicableLocationIds,
    minStaffing: position.minStaffing,
    preferredStaffing: position.preferredStaffing,
    maxStaffing: position.maxStaffing,
    unlimitedSeating: position.unlimitedSeating === true,
    minAssignmentMinutes: position.minAssignmentMinutes,
    maxContinuousMinutes: position.maxContinuousMinutes,
    requiresPhysicalPresence: position.requiresPhysicalPresence,
    blocksOtherAssignments: position.blocksOtherAssignments,
    countsAsPublicService: position.countsAsPublicService,
    selfClaimable: position.selfClaimable,
    swapsAllowed: position.swapsAllowed,
    eligibleClassifications: position.eligibleClassifications,
    order: position.order,
    active: position.active,
    updatedAt: serverTimestamp(),
  };
  if (position.description) payload.description = position.description;
  if (position.departmentId) payload.departmentId = position.departmentId;
  if (position.requiredQualification) payload.requiredQualification = position.requiredQualification;
  if (position.frequency) payload.frequency = position.frequency;
  // Keep legacy primary location for older clients.
  payload.locationId = applicableLocationIds[0] ?? null;
  return payload;
}

function locationPayload(location: Location): DocumentData {
  const payload: DocumentData = {
    name: location.name,
    shortName: location.shortName,
    timeZone: location.timeZone,
    minStaffing: location.minStaffing,
    openBufferMinutes: location.openBufferMinutes,
    closeBufferMinutes: location.closeBufferMinutes,
    active: location.active,
    updatedAt: serverTimestamp(),
  };
  if (location.description) payload.description = location.description;
  if (location.libcalId) payload.libcalId = location.libcalId;
  return payload;
}

function departmentPayload(department: Department): DocumentData {
  return {
    name: department.name,
    active: department.active,
    updatedAt: serverTimestamp(),
  };
}

export function subscribePositions(
  onChange: (positions: Position[]) => void,
  onError?: (error: unknown) => void,
): () => void {
  const db = getDb();
  if (!db) return () => {};
  return onSnapshot(
    collection(db, orgPath("positions")),
    (snapshot) => onChange(snapshot.docs.map((item) => mapPosition(item.id, item.data()))),
    (error) => onError?.(error),
  );
}

export function subscribeLocations(
  onChange: (locations: Location[]) => void,
  onError?: (error: unknown) => void,
): () => void {
  const db = getDb();
  if (!db) return () => {};
  return onSnapshot(
    collection(db, orgPath("locations")),
    (snapshot) => onChange(snapshot.docs.map((item) => mapLocation(item.id, item.data()))),
    (error) => onError?.(error),
  );
}

export function subscribeDepartments(
  onChange: (departments: Department[]) => void,
  onError?: (error: unknown) => void,
): () => void {
  const db = getDb();
  if (!db) return () => {};
  return onSnapshot(
    collection(db, orgPath("departments")),
    (snapshot) => onChange(snapshot.docs.map((item) => mapDepartment(item.id, item.data()))),
    (error) => onError?.(error),
  );
}

export async function writePosition(position: Position): Promise<void> {
  const db = getDb();
  if (!db) return;
  await setDoc(doc(db, orgPath("positions"), position.id), positionPayload(position), { merge: true });
}

export async function deletePosition(positionId: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  await deleteDoc(doc(db, orgPath("positions"), positionId));
}

export async function writeLocation(location: Location): Promise<void> {
  const db = getDb();
  if (!db) return;
  await setDoc(doc(db, orgPath("locations"), location.id), locationPayload(location), { merge: true });
}

export async function writeDepartment(department: Department): Promise<void> {
  const db = getDb();
  if (!db) return;
  await setDoc(doc(db, orgPath("departments"), department.id), departmentPayload(department), { merge: true });
}

export async function bootstrapPositions(positions: Position[]): Promise<void> {
  if (positions.length === 0) return;
  await Promise.all(positions.map((position) => writePosition(position)));
}

export async function bootstrapLocations(locations: Location[]): Promise<void> {
  if (locations.length === 0) return;
  await Promise.all(locations.map((location) => writeLocation(location)));
}

export async function bootstrapDepartments(departments: Department[]): Promise<void> {
  if (departments.length === 0) return;
  await Promise.all(departments.map((department) => writeDepartment(department)));
}
