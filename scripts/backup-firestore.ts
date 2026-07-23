/**
 * Export a point-in-time backup of the tenant's Firestore data (and optionally
 * Firebase Auth users) to a JSON file on disk.
 *
 * The export is intended for disaster recovery, pre-migration review, and
 * running destructive scripts (e.g. merge-duplicate-accounts) against a copy
 * first. It is NOT a Firestore managed export — restore requires a companion
 * import script or manual re-seeding.
 *
 *   # Authenticate the Admin SDK first (either works):
 *   gcloud auth application-default login
 *   #   ...or: export GOOGLE_APPLICATION_CREDENTIALS=./service-account.json
 *   npm run backup:firestore
 *   npm run backup:firestore -- --output ./backups/my-backup.json
 *   npm run backup:firestore -- --no-auth
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { applicationDefault, cert, initializeApp } from "firebase-admin/app";
import { getAuth, type UserRecord } from "firebase-admin/auth";
import {
  getFirestore,
  type DocumentData,
  type DocumentReference,
  type Firestore,
  type Timestamp,
} from "firebase-admin/firestore";
import { ORGANIZATION_ID } from "../src/lib/config";

/** Collections known to exist in rules / functions; used when listCollections is empty. */
export const KNOWN_ORG_COLLECTIONS = [
  "auditEvents",
  "availabilityPatterns",
  "breakPolicies",
  "complianceOverrides",
  "coverageRequirements",
  "dailyNotes",
  "departments",
  "employeeProfiles",
  "globalExceptions",
  "leaveRecords",
  "leaveTypes",
  "locations",
  "maintenance",
  "managerNotes",
  "notifications",
  "operatingHours",
  "positions",
  "schedules",
  "shifts",
  "swapRequests",
  "tasks",
  "teams",
  "users",
  "workingHoursPatterns",
] as const;

export interface BackupAuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  disabled: boolean;
  emailVerified: boolean;
  customClaims: Record<string, unknown> | null;
  metadata: {
    creationTime: string | null;
    lastSignInTime: string | null;
  };
}

export interface BackupMeta {
  projectId: string;
  organizationId: string;
  exportedAt: string;
  emulator: boolean;
  includeAuth: boolean;
  collections: Record<string, number>;
  authUserCount: number;
}

export interface FirestoreBackup {
  meta: BackupMeta;
  auth?: { users: BackupAuthUser[] };
  firestore: Record<string, Record<string, DocumentData>>;
}

/** Convert Firestore field values into JSON-safe primitives. */
export function serializeFirestoreValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (value instanceof Date) return value.toISOString();
  if (isTimestamp(value)) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(serializeFirestoreValue);
  if (isGeoPoint(value)) {
    return { _type: "geopoint", latitude: value.latitude, longitude: value.longitude };
  }
  if (isDocumentReference(value)) {
    return { _type: "reference", path: value.path };
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      out[key] = serializeFirestoreValue(nested);
    }
    return out;
  }
  return String(value);
}

function isTimestamp(value: unknown): value is Timestamp {
  return !!value && typeof value === "object" && typeof (value as Timestamp).toDate === "function";
}

function isGeoPoint(value: unknown): value is { latitude: number; longitude: number } {
  return !!value && typeof value === "object" && "latitude" in value && "longitude" in value;
}

function isDocumentReference(value: unknown): value is { path: string } {
  return !!value && typeof value === "object" && typeof (value as { path?: unknown }).path === "string";
}

export function serializeAuthUser(user: UserRecord): BackupAuthUser {
  return {
    uid: user.uid,
    email: user.email ?? null,
    displayName: user.displayName ?? null,
    disabled: user.disabled,
    emailVerified: user.emailVerified,
    customClaims: user.customClaims ?? null,
    metadata: {
      creationTime: user.metadata.creationTime ?? null,
      lastSignInTime: user.metadata.lastSignInTime ?? null,
    },
  };
}

function parseArgs(argv: string[]): { output: string; includeAuth: boolean } {
  let output = "";
  let includeAuth = true;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--no-auth") includeAuth = false;
    else if (arg === "--output" || arg === "-o") {
      output = argv[i + 1] ?? "";
      i++;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: npm run backup:firestore -- [--output <path>] [--no-auth]

Exports organizations/${ORGANIZATION_ID}/* to JSON (default: backups/firestore-<timestamp>.json).
Pass --no-auth to skip the Firebase Auth user list.`);
      process.exit(0);
    }
  }
  if (!output) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    output = path.join("backups", `firestore-${stamp}.json`);
  }
  return { output, includeAuth };
}

async function listOrgCollections(orgRef: DocumentReference): Promise<string[]> {
  const discovered = (await orgRef.listCollections()).map((col) => col.id).sort();
  if (discovered.length > 0) return discovered;
  return [...KNOWN_ORG_COLLECTIONS];
}

async function exportAuthUsers(): Promise<BackupAuthUser[]> {
  const auth = getAuth();
  const users: BackupAuthUser[] = [];
  let pageToken: string | undefined;
  do {
    const page = await auth.listUsers(1000, pageToken);
    users.push(...page.users.map(serializeAuthUser));
    pageToken = page.pageToken;
  } while (pageToken);
  return users;
}

async function exportFirestoreCollections(
  db: Firestore,
  orgPath: string,
  collectionIds: string[],
): Promise<{ firestore: Record<string, Record<string, DocumentData>>; counts: Record<string, number> }> {
  const firestore: Record<string, Record<string, DocumentData>> = {};
  const counts: Record<string, number> = {};

  for (const collectionId of collectionIds) {
    const snap = await db.collection(`${orgPath}/${collectionId}`).get();
    const docs: Record<string, DocumentData> = {};
    for (const doc of snap.docs) {
      docs[doc.id] = serializeFirestoreValue(doc.data()) as DocumentData;
    }
    firestore[collectionId] = docs;
    counts[collectionId] = snap.size;
    console.log(`  ✓ ${collectionId}: ${snap.size} document(s)`);
  }

  return { firestore, counts };
}

async function main() {
  const { output, includeAuth } = parseArgs(process.argv.slice(2));
  const emulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST);

  const app = initializeApp(
    process.env.GOOGLE_APPLICATION_CREDENTIALS
      ? { credential: cert(process.env.GOOGLE_APPLICATION_CREDENTIALS) }
      : { credential: applicationDefault() },
  );

  const projectId =
    app.options.projectId ??
    process.env.GOOGLE_CLOUD_PROJECT ??
    process.env.GCLOUD_PROJECT ??
    "(unknown — check credentials)";
  console.log(`Backing up project: ${projectId} (organization "${ORGANIZATION_ID}")`);
  if (emulator) {
    console.warn(
      `⚠︎  Emulator env vars are set — exporting from the EMULATOR, not production.\n` +
        `    FIRESTORE_EMULATOR_HOST=${process.env.FIRESTORE_EMULATOR_HOST ?? "(unset)"}\n` +
        `    FIREBASE_AUTH_EMULATOR_HOST=${process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "(unset)"}`,
    );
  }

  const db = getFirestore();
  const orgPath = `organizations/${ORGANIZATION_ID}`;
  const orgRef = db.doc(orgPath);
  const collectionIds = await listOrgCollections(orgRef);
  console.log(`Collections: ${collectionIds.join(", ")}`);

  const { firestore, counts } = await exportFirestoreCollections(db, orgPath, collectionIds);

  let authUsers: BackupAuthUser[] = [];
  if (includeAuth) {
    console.log("Exporting Firebase Auth users…");
    authUsers = await exportAuthUsers();
    console.log(`  ✓ auth: ${authUsers.length} user(s)`);
  }

  const backup: FirestoreBackup = {
    meta: {
      projectId,
      organizationId: ORGANIZATION_ID,
      exportedAt: new Date().toISOString(),
      emulator,
      includeAuth,
      collections: counts,
      authUserCount: authUsers.length,
    },
    firestore,
  };
  if (includeAuth) backup.auth = { users: authUsers };

  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(backup, null, 2)}\n`, "utf8");

  const totalDocs = Object.values(counts).reduce((sum, n) => sum + n, 0);
  console.log(
    `\nBackup complete: ${totalDocs} Firestore document(s)` +
      (includeAuth ? `, ${authUsers.length} Auth user(s)` : "") +
      `\nWrote ${path.resolve(output)}`,
  );
}

const invokedDirectly = process.argv.some((arg) => arg.endsWith("backup-firestore.ts"));
if (invokedDirectly) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
