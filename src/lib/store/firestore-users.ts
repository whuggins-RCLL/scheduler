/**
 * Firestore repository for the `users` collection.
 *
 * The rest of the app runs against an in-memory {@link Database}. This module is
 * the one place that bridges that store to the live `organizations/{orgId}/users`
 * collection, and it is only ever exercised when a real Firebase project is
 * configured (see {@link getDb}); in local/demo mode every function here is a
 * no-op, so tests and `npm run dev` are unaffected.
 *
 * Why this exists: Google sign-in authenticates a person, but nothing else was
 * recording them anywhere administrators could see. On first sign-in a user now
 * self-registers a `pending_approval` account (the only thing Firestore rules
 * let a non-admin write about themselves), which makes them visible on the admin
 * User management screen so an administrator can approve them and assign roles.
 */
import type { User as FirebaseUser } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  type DocumentData,
} from "firebase/firestore";
import type { AccountState, Role, RoleGrant, UserAccount } from "@/domain/types";
import { ORGANIZATION_ID } from "@/lib/config";
import { isBootstrapAdmin, normalizeEmail } from "@/lib/authz";
import { getDb } from "@/lib/firebase";

const VALID_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "SCHEDULER", "EMPLOYEE", "VIEWER", "AUDITOR"];

function usersCollectionPath() {
  return `organizations/${ORGANIZATION_ID}/users`;
}

/** Coerce a Firestore timestamp / ISO string / missing value into an ISO string. */
function toIso(value: unknown, fallback: string): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "toDate" in value) {
    try {
      return (value as { toDate: () => Date }).toDate().toISOString();
    } catch {
      return fallback;
    }
  }
  return fallback;
}

/**
 * Normalize the stored `roles` field into the domain's {@link RoleGrant}[] shape.
 * Tolerates both representations that reach Firestore: the seed/Admin-SDK script
 * writes a plain string list (`["SUPER_ADMIN"]`) to match custom claims, while
 * in-app role edits write structured grants (`[{ role, scope? }]`).
 */
export function normalizeRoles(raw: unknown): RoleGrant[] {
  if (!Array.isArray(raw)) return [];
  const grants: RoleGrant[] = [];
  for (const entry of raw) {
    if (typeof entry === "string") {
      if ((VALID_ROLES as string[]).includes(entry)) grants.push({ role: entry as Role });
    } else if (entry && typeof entry === "object" && typeof (entry as RoleGrant).role === "string") {
      const g = entry as RoleGrant;
      if ((VALID_ROLES as string[]).includes(g.role)) {
        grants.push(g.scope ? { role: g.role, scope: g.scope } : { role: g.role });
      }
    }
  }
  return grants;
}

/** The flat list of role names, used for the middleware cookie and custom claims. */
export function roleNames(roles: RoleGrant[]): Role[] {
  return roles.map((g) => g.role);
}

function mapDoc(id: string, data: DocumentData): UserAccount {
  const now = new Date().toISOString();
  return {
    id,
    email: normalizeEmail(String(data.email ?? "")),
    displayName: String(data.displayName ?? data.email ?? "Unknown user"),
    state: (data.state as AccountState) ?? "pending_approval",
    roles: normalizeRoles(data.roles),
    createdAt: toIso(data.createdAt, now),
    updatedAt: toIso(data.updatedAt, now),
  };
}

/** The account a bootstrap administrator must always have (break-glass). */
export const BOOTSTRAP_ROLES: RoleGrant[] = [{ role: "SUPER_ADMIN" }, { role: "MANAGER" }];

function hasSuperAdmin(roles: RoleGrant[]): boolean {
  return roles.some((g) => g.role === "SUPER_ADMIN");
}

/**
 * Whether a bootstrap administrator's existing document must be repaired to the
 * break-glass account (active SUPER_ADMIN). Pure so it can be unit-tested.
 */
export function bootstrapRepairNeeded(
  account: Pick<UserAccount, "state" | "roles">,
  isBootstrap: boolean,
): boolean {
  if (!isBootstrap) return false;
  return !(account.state === "active" && hasSuperAdmin(account.roles));
}

/**
 * Ensure a `users/{uid}` document exists (and is correct) for the signed-in
 * Firebase user, then return the resulting account.
 *
 * Bootstrap administrators are a break-glass identity: they must ALWAYS resolve
 * to an active SUPER_ADMIN, so their document is created — or repaired — on
 * sign-in even if a prior seed missed this project/UID or left them role-less.
 * This is safe because the same five emails are trusted by `firestore.rules`
 * (see `isBootstrapAdmin`), which is what authorizes this self-write. Everyone
 * else self-registers as `pending_approval` with no roles, and an existing
 * non-admin document is returned untouched (we never clobber assigned roles).
 */
export async function ensureUserAccount(fbUser: FirebaseUser): Promise<UserAccount | null> {
  const db = getDb();
  if (!db) return null;
  const email = normalizeEmail(fbUser.email ?? "");
  const displayName = fbUser.displayName ?? email;
  const bootstrap = isBootstrapAdmin(email);
  const ref = doc(db, usersCollectionPath(), fbUser.uid);
  const now = new Date().toISOString();

  const existing = await getDoc(ref);
  if (existing.exists()) {
    const account = mapDoc(existing.id, existing.data());
    // Self-heal a bootstrap admin whose document lost (or never had) its role.
    if (bootstrapRepairNeeded(account, bootstrap)) {
      await updateDoc(ref, {
        state: "active",
        roles: roleNames(BOOTSTRAP_ROLES),
        updatedAt: serverTimestamp(),
      });
      return { ...account, state: "active", roles: BOOTSTRAP_ROLES, updatedAt: now };
    }
    return account;
  }

  const roles: RoleGrant[] = bootstrap ? BOOTSTRAP_ROLES : [];
  const state: AccountState = bootstrap ? "active" : "pending_approval";

  await setDoc(ref, {
    email,
    displayName,
    state,
    // Store the role-name list: it matches the custom-claims shape written by the
    // Admin SDK seed script and is what Firestore rules read.
    roles: roleNames(roles),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return { id: fbUser.uid, email, displayName, state, roles, createdAt: now, updatedAt: now };
}

/**
 * Subscribe to the whole users collection. Only administrators/staff may read it
 * (Firestore rules), so `onError` fires with a permission error for ordinary
 * users — callers should treat that as "you can only see yourself" and ignore it.
 * Returns an unsubscribe function (a no-op when Firebase is not configured).
 */
export function subscribeUsers(
  onChange: (users: UserAccount[]) => void,
  onError?: (err: unknown) => void,
): () => void {
  const db = getDb();
  if (!db) return () => {};
  return onSnapshot(
    collection(db, usersCollectionPath()),
    (snap) => onChange(snap.docs.map((d) => mapDoc(d.id, d.data()))),
    (err) => onError?.(err),
  );
}

/** Persist an administrator's account-state change to Firestore. */
export async function writeUserState(userId: string, state: AccountState): Promise<void> {
  const db = getDb();
  if (!db) return;
  await updateDoc(doc(db, usersCollectionPath(), userId), { state, updatedAt: serverTimestamp() });
}

/**
 * Persist an administrator's role change to Firestore.
 *
 * NOTE: This updates the user *document*, which is what the application reads for
 * its own UI gating. It does NOT update the Firebase custom claims that
 * `firestore.rules` enforce at the database layer — only the Admin SDK can do
 * that (see docs/security-model.md). A Cloud Function mirroring this field onto
 * claims is the remaining step for full rule-level enforcement.
 */
export async function writeUserRoles(userId: string, roles: RoleGrant[]): Promise<void> {
  const db = getDb();
  if (!db) return;
  await updateDoc(doc(db, usersCollectionPath(), userId), {
    roles: roleNames(roles),
    updatedAt: serverTimestamp(),
  });
}
