/**
 * One-time, idempotent workforce repair.
 *
 * This script does three related jobs:
 *   1. makes the chosen Will/George accounts canonical and archives their aliases,
 *   2. moves any employee-owned records from an alias UID to the canonical UID,
 *   3. creates a schedulable employee profile for every active staff account.
 *
 * Administrator permissions and employee scheduling membership remain separate:
 * Will and George keep SUPER_ADMIN/MANAGER roles while also receiving employee
 * profiles. Other active employees receive a safe zero-hour draft until an admin
 * completes Staff onboarding in the app.
 *
 * Authenticate before running against production:
 *   gcloud auth application-default login
 *   npm run backfill:workforce
 */
import { applicationDefault, cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import type { Role, RoleGrant, UserAccount } from "../src/domain/types";
import { ORGANIZATION_ID } from "../src/lib/config";
import { defaultEmployeeProfile } from "../src/lib/store/employee-profile";

interface CanonicalIdentity {
  canonicalEmail: string;
  aliasEmails: string[];
}

const CANONICAL_IDENTITIES: CanonicalIdentity[] = [
  {
    canonicalEmail: "whuggins@law.stanford.edu",
    aliasEmails: ["whuggins@stanford.edu"],
  },
  {
    canonicalEmail: "gwilson@stanford.edu",
    aliasEmails: ["gwilson@law.stanford.edu"],
  },
];

const VALID_ROLES = new Set<Role>([
  "SUPER_ADMIN",
  "MANAGER",
  "SCHEDULER",
  "LIBRARY_STAFF",
  "VIEWER",
  "AUDITOR",
]);
const STAFF_ROLES = new Set<Role>(["SUPER_ADMIN", "MANAGER", "SCHEDULER", "LIBRARY_STAFF"]);

const app = initializeApp(
  process.env.GOOGLE_APPLICATION_CREDENTIALS
    ? { credential: cert(process.env.GOOGLE_APPLICATION_CREDENTIALS) }
    : { credential: applicationDefault() },
);
const auth = getAuth(app);
const db = getFirestore(app);
const orgPath = `organizations/${ORGANIZATION_ID}`;

const projectId =
  app.options.projectId ??
  process.env.GOOGLE_CLOUD_PROJECT ??
  process.env.GCLOUD_PROJECT ??
  "(unknown — check credentials)";

function normalizeEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeRoles(value: unknown): Role[] {
  if (!Array.isArray(value)) return [];
  const roles = value.flatMap((entry): Role[] => {
    const role = typeof entry === "string"
      ? entry
      : entry && typeof entry === "object"
        ? (entry as { role?: unknown }).role
        : undefined;
    return typeof role === "string" && VALID_ROLES.has(role as Role) ? [role as Role] : [];
  });
  return [...new Set(roles)];
}

function grants(roles: Role[]): RoleGrant[] {
  return roles.map((role) => ({ role }));
}

function hasStaffRole(roles: Role[]): boolean {
  return roles.some((role) => STAFF_ROLES.has(role));
}

function withoutUndefined<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function setAuthRoles(userId: string, roles: Role[]): Promise<void> {
  const user = await auth.getUser(userId);
  await auth.setCustomUserClaims(userId, {
    ...(user.customClaims ?? {}),
    roles,
    orgId: ORGANIZATION_ID,
  });
  await auth.revokeRefreshTokens(userId);
}

async function moveReferences(
  aliasId: string,
  canonicalId: string,
): Promise<number> {
  let changed = 0;
  const employeeOwned = ["availabilityPatterns", "workingHoursPatterns", "leaveRecords", "shifts"];
  for (const collectionName of employeeOwned) {
    const snapshot = await db.collection(`${orgPath}/${collectionName}`).where("employeeId", "==", aliasId).get();
    for (const item of snapshot.docs) {
      await item.ref.update({ employeeId: canonicalId, updatedAt: FieldValue.serverTimestamp() });
      changed++;
    }
  }

  for (const field of ["fromEmployeeId", "toEmployeeId"] as const) {
    const snapshot = await db.collection(`${orgPath}/swapRequests`).where(field, "==", aliasId).get();
    for (const item of snapshot.docs) {
      await item.ref.update({ [field]: canonicalId, updatedAt: FieldValue.serverTimestamp() });
      changed++;
    }
  }

  const primaryReports = await db.collection(`${orgPath}/employeeProfiles`).where("primaryManagerId", "==", aliasId).get();
  for (const item of primaryReports.docs) {
    await item.ref.update({ primaryManagerId: canonicalId, updatedAt: FieldValue.serverTimestamp() });
    changed++;
  }

  const additionalReports = await db
    .collection(`${orgPath}/employeeProfiles`)
    .where("additionalManagerIds", "array-contains", aliasId)
    .get();
  for (const item of additionalReports.docs) {
    const managerIds = Array.isArray(item.data().additionalManagerIds)
      ? item.data().additionalManagerIds.filter((id: unknown): id is string => typeof id === "string")
      : [];
    await item.ref.update({
      additionalManagerIds: [...new Set(managerIds.map((id: string) => id === aliasId ? canonicalId : id))],
      updatedAt: FieldValue.serverTimestamp(),
    });
    changed++;
  }

  return changed;
}

async function ensureCanonicalIdentity(identity: CanonicalIdentity): Promise<void> {
  const userSnapshot = await db.collection(`${orgPath}/users`).get();
  const byEmail = new Map<string, typeof userSnapshot.docs>();
  for (const document of userSnapshot.docs) {
    const email = normalizeEmail(document.data().email);
    byEmail.set(email, [...(byEmail.get(email) ?? []), document]);
  }

  let canonicalDocs = byEmail.get(identity.canonicalEmail) ?? [];
  if (canonicalDocs.length === 0) {
    const authUser = await auth.getUserByEmail(identity.canonicalEmail);
    const reference = db.doc(`${orgPath}/users/${authUser.uid}`);
    await reference.set({
      email: identity.canonicalEmail,
      displayName: authUser.displayName ?? identity.canonicalEmail,
      state: "active",
      roles: ["SUPER_ADMIN", "MANAGER"],
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    canonicalDocs = [(await reference.get()) as typeof userSnapshot.docs[number]];
  }

  const canonical = canonicalDocs[0];
  const canonicalRoles = [...new Set([
    ...normalizeRoles(canonical.data().roles),
    "SUPER_ADMIN" as const,
    "MANAGER" as const,
  ])];
  await canonical.ref.set({
    email: identity.canonicalEmail,
    state: "active",
    roles: canonicalRoles,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  await setAuthRoles(canonical.id, canonicalRoles);

  const canonicalProfileRef = db.doc(`${orgPath}/employeeProfiles/${canonical.id}`);
  let canonicalProfile = await canonicalProfileRef.get();

  for (const aliasEmail of identity.aliasEmails) {
    for (const alias of byEmail.get(aliasEmail) ?? []) {
      if (alias.id === canonical.id) continue;
      const aliasProfileRef = db.doc(`${orgPath}/employeeProfiles/${alias.id}`);
      const aliasProfile = await aliasProfileRef.get();

      if (!canonicalProfile.exists && aliasProfile.exists) {
        await canonicalProfileRef.set({
          ...aliasProfile.data(),
          legalName: String(canonical.data().displayName ?? identity.canonicalEmail),
          email: identity.canonicalEmail,
          active: true,
          updatedAt: FieldValue.serverTimestamp(),
        });
        canonicalProfile = await canonicalProfileRef.get();
      }

      const moved = await moveReferences(alias.id, canonical.id);
      await alias.ref.set({ state: "archived", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      if (aliasProfile.exists) {
        await aliasProfileRef.set({ active: false, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      }
      await setAuthRoles(alias.id, []);
      console.log(`  ✓ archived ${aliasEmail}; moved ${moved} linked record${moved === 1 ? "" : "s"}`);
    }
  }

  if (!canonicalProfile.exists) {
    const account: UserAccount = {
      id: canonical.id,
      email: identity.canonicalEmail,
      displayName: String(canonical.data().displayName ?? identity.canonicalEmail),
      state: "active",
      roles: grants(canonicalRoles),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await canonicalProfileRef.set({
      ...withoutUndefined(defaultEmployeeProfile(account)),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  } else {
    await canonicalProfileRef.set({
      email: identity.canonicalEmail,
      active: true,
      setupComplete: true,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  console.log(`  ✓ canonical ${identity.canonicalEmail} → uid ${canonical.id}`);
}

async function ensureActiveStaffProfiles(): Promise<{ created: number; existing: number }> {
  const users = await db.collection(`${orgPath}/users`).get();
  let created = 0;
  let existing = 0;

  for (const document of users.docs) {
    const data = document.data();
    const roles = normalizeRoles(data.roles);
    if (data.state !== "active" || !hasStaffRole(roles)) continue;

    const profileRef = db.doc(`${orgPath}/employeeProfiles/${document.id}`);
    if ((await profileRef.get()).exists) {
      existing++;
      continue;
    }

    const account: UserAccount = {
      id: document.id,
      email: normalizeEmail(data.email),
      displayName: String(data.displayName ?? data.email ?? document.id),
      state: "active",
      roles: grants(roles),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await profileRef.set({
      ...withoutUndefined(defaultEmployeeProfile(account)),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    created++;
    console.log(`  ✓ created ${account.email} employee profile${account.roles.some((grant) => grant.role === "SUPER_ADMIN") ? " (admin + employee)" : ""}`);
  }

  return { created, existing };
}

async function main(): Promise<void> {
  console.log(`Repairing workforce in project: ${projectId} (organization "${ORGANIZATION_ID}")`);
  if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    console.warn("⚠︎ Emulator environment variables are set; this will not change production.");
  }

  for (const identity of CANONICAL_IDENTITIES) await ensureCanonicalIdentity(identity);
  const result = await ensureActiveStaffProfiles();
  console.log(`\nWorkforce repair complete: ${result.created} profiles created, ${result.existing} already present.`);
  console.log("Use Admin → Users → Staff onboarding to complete any profile marked Setup needed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
