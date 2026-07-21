/**
 * One-time migration: merge duplicate accounts created before email unification.
 *
 * Historically an account document was keyed on the Firebase Auth UID, so a
 * person who signed in with BOTH `@law.stanford.edu` and `@stanford.edu` ended up
 * with two accounts and their data (exceptions, availability, working hours) split
 * between them. Accounts are now keyed on the CANONICAL email
 * ({@link accountIdForEmail}); this script re-keys existing data to match:
 *
 *   1. Groups every `users` document by its canonical email.
 *   2. Merges each group into `users/{canonicalEmail}` — union of roles, the most
 *      privileged/active state, and every login's UID + email (`uids`,
 *      `signInEmails`).
 *   3. Re-points every id-bearing field (employeeId, userId, authorId, …) on the
 *      person's records from each old UID to the canonical id, re-creating the
 *      documents whose id embeds the old UID (availability / working-hours
 *      patterns) under the new id.
 *   4. Merges `employeeProfiles/{uid}` into `employeeProfiles/{canonicalEmail}` and
 *      removes the leftover UID-keyed user/profile documents.
 *
 * SAFETY:
 *   - DRY-RUN by default: it only prints what it would do. Pass `--commit` to write.
 *   - Idempotent: re-running after a completed migration is a no-op.
 *   - Run against a BACKUP / export first and review the dry-run output. The Admin
 *     SDK bypasses security rules, so this can create/delete anything.
 *
 *   gcloud auth application-default login   # or GOOGLE_APPLICATION_CREDENTIALS
 *   npx tsx scripts/merge-duplicate-accounts.ts            # dry run
 *   npx tsx scripts/merge-duplicate-accounts.ts --commit   # apply
 */
import { applicationDefault, cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore, type DocumentData } from "firebase-admin/firestore";
import { ORGANIZATION_ID } from "../src/lib/config";
import { accountIdForEmail, normalizeEmail } from "../src/lib/authz";

const COMMIT = process.argv.includes("--commit");

/** Account-id references to rewrite, per collection. */
const FIELD_REMAP: Record<string, string[]> = {
  leaveRecords: ["employeeId", "enteredBy", "decidedBy"],
  availabilityPatterns: ["employeeId", "updatedBy"],
  workingHoursPatterns: ["employeeId", "updatedBy"],
  swapRequests: ["fromEmployeeId", "toEmployeeId", "requestedBy", "decidedBy"],
  notifications: ["userId"],
  dailyNotes: ["authorId"],
  managerNotes: ["authorId", "employeeId"],
  shifts: ["employeeId", "assignedEmployeeId"],
};
/** Collections whose DOCUMENT ID embeds the account id and must be re-created. */
const ID_EMBEDDED = new Set(["availabilityPatterns", "workingHoursPatterns"]);

const ROLE_RANK: Record<string, number> = {
  SUPER_ADMIN: 6, MANAGER: 5, SCHEDULER: 4, LIBRARY_STAFF: 3, AUDITOR: 2, VIEWER: 1,
};

const app = initializeApp(
  process.env.GOOGLE_APPLICATION_CREDENTIALS
    ? { credential: cert(process.env.GOOGLE_APPLICATION_CREDENTIALS) }
    : { credential: applicationDefault() },
);
const projectId =
  app.options.projectId ?? process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCLOUD_PROJECT ?? "(unknown)";
const db = getFirestore();
const auth = getAuth();
const base = `organizations/${ORGANIZATION_ID}`;

console.log(`Merging duplicate accounts in project: ${projectId} (org "${ORGANIZATION_ID}")`);
console.log(COMMIT ? "MODE: --commit (writes will be applied)\n" : "MODE: dry run (no writes)\n");
if (process.env.FIRESTORE_EMULATOR_HOST) {
  console.warn("⚠︎  FIRESTORE_EMULATOR_HOST is set — this targets the EMULATOR.\n");
}

type Account = {
  canonicalId: string;
  displayName?: string;
  state: string;
  roles: unknown[];
  uids: Set<string>;
  emails: Set<string>;
  createdAt?: unknown;
  oldDocIds: string[]; // user doc ids in this group that are NOT the canonical id
};

function mergeState(a: string, b: string): string {
  // "active" wins; otherwise keep whichever is already set.
  if (a === "active" || b === "active") return "active";
  return a || b;
}

function mergeRoles(a: unknown[], b: unknown[]): unknown[] {
  const byName = new Map<string, unknown>();
  for (const grant of [...a, ...b]) {
    const name = typeof grant === "string" ? grant : (grant as { role?: string })?.role;
    if (!name) continue;
    // Keep the richer grant (object with scope) when ranks tie.
    if (!byName.has(name) || typeof grant === "object") byName.set(name, grant);
  }
  return [...byName.values()].sort((x, y) => {
    const nx = typeof x === "string" ? x : (x as { role: string }).role;
    const ny = typeof y === "string" ? y : (y as { role: string }).role;
    return (ROLE_RANK[ny] ?? 0) - (ROLE_RANK[nx] ?? 0);
  });
}

async function buildAccounts(): Promise<{ accounts: Map<string, Account>; idMap: Map<string, string> }> {
  const snap = await db.collection(`${base}/users`).get();
  const accounts = new Map<string, Account>();
  const idMap = new Map<string, string>(); // any old id (uid) -> canonical id

  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    const email = normalizeEmail(String(data.email ?? ""));
    if (!email) {
      console.warn(`  ! users/${docSnap.id} has no email — skipping`);
      continue;
    }
    const canonicalId = accountIdForEmail(email);
    const acct = accounts.get(canonicalId) ?? {
      canonicalId,
      state: "pending_approval",
      roles: [],
      uids: new Set<string>(),
      emails: new Set<string>(),
      oldDocIds: [],
    };
    acct.displayName = acct.displayName ?? (data.displayName ? String(data.displayName) : undefined);
    acct.state = mergeState(acct.state, String(data.state ?? "pending_approval"));
    acct.roles = mergeRoles(acct.roles, Array.isArray(data.roles) ? data.roles : []);
    acct.emails.add(email);
    for (const e of Array.isArray(data.signInEmails) ? data.signInEmails : []) acct.emails.add(normalizeEmail(String(e)));
    for (const u of Array.isArray(data.uids) ? data.uids : []) acct.uids.add(String(u));
    // A legacy account doc is keyed on the Firebase UID itself.
    if (docSnap.id !== canonicalId) {
      acct.uids.add(docSnap.id);
      acct.oldDocIds.push(docSnap.id);
      idMap.set(docSnap.id, canonicalId);
    }
    acct.createdAt = acct.createdAt ?? data.createdAt;
    accounts.set(canonicalId, acct);
  }
  return { accounts, idMap };
}

function remapValue(idMap: Map<string, string>, value: unknown): unknown {
  return typeof value === "string" && idMap.has(value) ? idMap.get(value) : value;
}

async function remapCollection(collection: string, idMap: Map<string, string>): Promise<number> {
  const fields = FIELD_REMAP[collection];
  const snap = await db.collection(`${base}/${collection}`).get();
  let touched = 0;
  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    const patch: DocumentData = {};
    for (const field of fields) {
      const next = remapValue(idMap, data[field]);
      if (next !== data[field]) patch[field] = next;
    }
    // Re-create documents whose id embeds an old uid (availability / working hours).
    let newId = docSnap.id;
    if (ID_EMBEDDED.has(collection)) {
      for (const [oldId, canonicalId] of idMap) {
        if (docSnap.id.includes(oldId)) { newId = docSnap.id.split(oldId).join(canonicalId); break; }
      }
    }
    const idChanged = newId !== docSnap.id;
    if (Object.keys(patch).length === 0 && !idChanged) continue;
    touched++;
    const merged = { ...data, ...patch };
    if (idChanged) {
      console.log(`  ${collection}: ${docSnap.id} → ${newId}${Object.keys(patch).length ? ` (${Object.keys(patch).join(",")})` : ""}`);
      if (COMMIT) {
        await db.doc(`${base}/${collection}/${newId}`).set(merged, { merge: true });
        await docSnap.ref.delete();
      }
    } else {
      console.log(`  ${collection}/${docSnap.id}: remap ${Object.keys(patch).join(",")}`);
      if (COMMIT) await docSnap.ref.set(patch, { merge: true });
    }
  }
  return touched;
}

async function mergeProfiles(idMap: Map<string, string>): Promise<void> {
  for (const [oldId, canonicalId] of idMap) {
    const oldRef = db.doc(`${base}/employeeProfiles/${oldId}`);
    const oldSnap = await oldRef.get();
    if (!oldSnap.exists) continue;
    const canonicalRef = db.doc(`${base}/employeeProfiles/${canonicalId}`);
    const canonicalSnap = await canonicalRef.get();
    console.log(`  employeeProfiles: ${oldId} → ${canonicalId}${canonicalSnap.exists ? " (merge into existing)" : ""}`);
    if (COMMIT) {
      // Prefer the already-canonical profile's fields; fill gaps from the old one.
      const merged = { ...oldSnap.data(), ...(canonicalSnap.data() ?? {}), id: canonicalId };
      await canonicalRef.set(merged, { merge: true });
      await oldRef.delete();
    }
  }
}

async function main() {
  const { accounts, idMap } = await buildAccounts();
  const dupes = [...accounts.values()].filter((a) => a.oldDocIds.length > 0);
  console.log(`Found ${accounts.size} canonical accounts; ${dupes.length} need re-keying.\n`);

  // 1. Write merged canonical account docs.
  for (const acct of dupes) {
    console.log(`Account ${acct.canonicalId}: state=${acct.state}, uids=[${[...acct.uids].join(", ")}]`);
    if (COMMIT) {
      await db.doc(`${base}/users/${acct.canonicalId}`).set(
        {
          email: acct.canonicalId,
          canonicalEmail: acct.canonicalId,
          displayName: acct.displayName ?? acct.canonicalId,
          state: acct.state,
          roles: acct.roles,
          uids: FieldValue.arrayUnion(...acct.uids),
          signInEmails: FieldValue.arrayUnion(...acct.emails),
          createdAt: acct.createdAt ?? FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }
  }

  if (idMap.size === 0) {
    console.log("\nNothing to migrate. Done.");
    return;
  }

  // 2. Re-point records across collections.
  console.log("\nRe-pointing records:");
  for (const collection of Object.keys(FIELD_REMAP)) {
    const n = await remapCollection(collection, idMap);
    if (n) console.log(`  ${collection}: ${n} document(s) affected`);
  }

  // 3. Merge employee profiles.
  console.log("\nMerging employee profiles:");
  await mergeProfiles(idMap);

  // 4. Remove leftover legacy user docs (data now lives on the canonical account).
  console.log("\nRemoving legacy user documents:");
  for (const [oldId, canonicalId] of idMap) {
    console.log(`  users/${oldId} (merged into ${canonicalId})`);
    if (COMMIT) await db.doc(`${base}/users/${oldId}`).delete();
  }

  // 5. Refresh custom claims on every linked UID so both logins get their roles.
  if (COMMIT) {
    for (const acct of dupes) {
      const roleNames = acct.roles
        .map((r) => (typeof r === "string" ? r : (r as { role?: string }).role))
        .filter((r): r is string => !!r);
      for (const uid of acct.uids) {
        try {
          await auth.setCustomUserClaims(uid, {
            ...(acct.state === "active" && roleNames.length ? { roles: roleNames } : {}),
            orgId: ORGANIZATION_ID,
          });
          await auth.revokeRefreshTokens(uid);
        } catch (err) {
          console.warn(`  ! could not set claims for uid ${uid}:`, err);
        }
      }
    }
  }

  console.log(
    COMMIT
      ? "\n✅ Migration complete."
      : "\nDry run complete — re-run with --commit to apply (against a backup first).",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
