/**
 * Server-side merge of duplicate accounts created before email unification.
 *
 * Historically an account was keyed on the Firebase Auth UID, so a person who
 * signed in with both `@law.stanford.edu` and `@stanford.edu` ended up with two
 * accounts and their data split between them. This routine re-keys everything to
 * the CANONICAL email ({@link accountIdForEmail}): it groups `users` docs by
 * canonical email, merges each group into `users/{canonicalEmail}`, re-points
 * every id-bearing field on the person's records (and re-creates the docs whose
 * id embeds the old UID), merges employee profiles, removes the leftover
 * UID-keyed documents, and refreshes each linked UID's custom claims.
 *
 * Runs with the Admin SDK (bypasses security rules) and is invoked from the
 * admin-triggered maintenance flow — the same request/response document pattern
 * as `provisionMissingUsers`, so no local tooling or public endpoint is needed.
 */
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore, type DocumentData } from "firebase-admin/firestore";
import { accountIdForEmail, normalizeEmail } from "./provision";

export interface MergeResult {
  canonicalAccounts: number;
  duplicatesMerged: number;
  recordsRepointed: number;
  profilesMerged: number;
  legacyUsersRemoved: number;
}

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

interface Account {
  canonicalId: string;
  displayName?: string;
  state: string;
  roles: unknown[];
  uids: Set<string>;
  emails: Set<string>;
  createdAt?: unknown;
  oldDocIds: string[]; // user doc ids in this group that are NOT the canonical id
}

function mergeState(a: string, b: string): string {
  if (a === "active" || b === "active") return "active";
  return a || b;
}

function roleName(grant: unknown): string | undefined {
  return typeof grant === "string" ? grant : (grant as { role?: string })?.role;
}

function mergeRoles(a: unknown[], b: unknown[]): unknown[] {
  const byName = new Map<string, unknown>();
  for (const grant of [...a, ...b]) {
    const name = roleName(grant);
    if (!name) continue;
    if (!byName.has(name) || typeof grant === "object") byName.set(name, grant);
  }
  return [...byName.values()].sort(
    (x, y) => (ROLE_RANK[roleName(y) ?? ""] ?? 0) - (ROLE_RANK[roleName(x) ?? ""] ?? 0),
  );
}

export async function runMergeDuplicateAccounts(orgId: string): Promise<MergeResult> {
  const db = getFirestore();
  const auth = getAuth();
  const base = `organizations/${orgId}`;

  // 1. Group every users doc by canonical email; build the old-uid → canonical map.
  const snap = await db.collection(`${base}/users`).get();
  const accounts = new Map<string, Account>();
  const idMap = new Map<string, string>();

  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    const email = normalizeEmail(String(data.email ?? ""));
    if (!email) continue;
    const canonicalId = accountIdForEmail(email);
    const acct = accounts.get(canonicalId) ?? {
      canonicalId,
      state: "pending_approval",
      roles: [] as unknown[],
      uids: new Set<string>(),
      emails: new Set<string>(),
      oldDocIds: [] as string[],
    };
    acct.displayName = acct.displayName ?? (data.displayName ? String(data.displayName) : undefined);
    acct.state = mergeState(acct.state, String(data.state ?? "pending_approval"));
    acct.roles = mergeRoles(acct.roles, Array.isArray(data.roles) ? data.roles : []);
    acct.emails.add(email);
    for (const e of Array.isArray(data.signInEmails) ? data.signInEmails : []) acct.emails.add(normalizeEmail(String(e)));
    for (const u of Array.isArray(data.uids) ? data.uids : []) acct.uids.add(String(u));
    if (docSnap.id !== canonicalId) {
      acct.uids.add(docSnap.id); // a legacy doc is keyed on the Firebase UID
      acct.oldDocIds.push(docSnap.id);
      idMap.set(docSnap.id, canonicalId);
    }
    acct.createdAt = acct.createdAt ?? data.createdAt;
    accounts.set(canonicalId, acct);
  }

  const dupes = [...accounts.values()].filter((a) => a.oldDocIds.length > 0);
  const result: MergeResult = {
    canonicalAccounts: accounts.size,
    duplicatesMerged: dupes.reduce((n, a) => n + a.oldDocIds.length, 0),
    recordsRepointed: 0,
    profilesMerged: 0,
    legacyUsersRemoved: 0,
  };
  if (idMap.size === 0) return result;

  // 2. Write the merged canonical account docs.
  for (const acct of dupes) {
    const canonicalEmail = acct.canonicalId;
    await db.doc(`${base}/users/${canonicalEmail}`).set(
      {
        email: canonicalEmail,
        canonicalEmail,
        displayName: acct.displayName ?? canonicalEmail,
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

  // 3. Re-point id-bearing fields across collections; re-create id-embedded docs.
  for (const [collection, fields] of Object.entries(FIELD_REMAP)) {
    const docs = await db.collection(`${base}/${collection}`).get();
    for (const docSnap of docs.docs) {
      const data = docSnap.data();
      const patch: DocumentData = {};
      for (const field of fields) {
        const value = data[field];
        if (typeof value === "string" && idMap.has(value)) patch[field] = idMap.get(value);
      }
      let newId = docSnap.id;
      if (ID_EMBEDDED.has(collection)) {
        for (const [oldId, canonicalId] of idMap) {
          if (docSnap.id.includes(oldId)) { newId = docSnap.id.split(oldId).join(canonicalId); break; }
        }
      }
      const idChanged = newId !== docSnap.id;
      if (Object.keys(patch).length === 0 && !idChanged) continue;
      result.recordsRepointed++;
      if (idChanged) {
        await db.doc(`${base}/${collection}/${newId}`).set({ ...data, ...patch }, { merge: true });
        await docSnap.ref.delete();
      } else {
        await docSnap.ref.set(patch, { merge: true });
      }
    }
  }

  // 4. Merge employee profiles onto the canonical id.
  for (const [oldId, canonicalId] of idMap) {
    const oldRef = db.doc(`${base}/employeeProfiles/${oldId}`);
    const oldSnap = await oldRef.get();
    if (!oldSnap.exists) continue;
    const canonicalRef = db.doc(`${base}/employeeProfiles/${canonicalId}`);
    const canonicalSnap = await canonicalRef.get();
    await canonicalRef.set(
      { ...oldSnap.data(), ...(canonicalSnap.data() ?? {}), id: canonicalId },
      { merge: true },
    );
    await oldRef.delete();
    result.profilesMerged++;
  }

  // 5. Remove the leftover UID-keyed user documents.
  for (const oldId of idMap.keys()) {
    await db.doc(`${base}/users/${oldId}`).delete();
    result.legacyUsersRemoved++;
  }

  // 6. Refresh custom claims on every linked UID so both logins get their roles.
  for (const acct of dupes) {
    const roles = acct.roles.map(roleName).filter((r): r is string => !!r);
    for (const uid of acct.uids) {
      try {
        await auth.setCustomUserClaims(uid, {
          ...(acct.state === "active" && roles.length ? { roles } : {}),
          orgId,
        });
        await auth.revokeRefreshTokens(uid);
      } catch {
        // No auth user for this id (e.g. a placeholder) — nothing to claim.
      }
    }
  }

  return result;
}
