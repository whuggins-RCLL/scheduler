/**
 * Pure role → custom-claims reconciliation.
 *
 * This module has NO Firebase / I/O dependencies so it can be unit-tested and
 * shared by both the Firestore trigger (`index.ts`) and the one-time backfill
 * script (`scripts/backfill-claims.ts`). Given a user document and the auth
 * user's existing custom claims, it computes the claims the user *should* have
 * and whether anything actually changed.
 *
 * Design rules:
 *  - Only `roles` is a fully managed claim. It is present only while the account
 *    is `active`; any other state (pending, invited, suspended, archived,
 *    revoked) or a deleted document removes the `roles` claim entirely.
 *  - `orgId` is a tenant tag: set when the account exists and it is missing or
 *    wrong, but never stripped.
 *  - Every other pre-existing claim is preserved untouched.
 *  - The comparison is order-insensitive on `roles`, so re-running never
 *    produces a spurious write (idempotent).
 */

/** Roles recognized by the platform (mirrors `src/domain/types.ts`). */
export const VALID_ROLES = [
  "SUPER_ADMIN",
  "MANAGER",
  "SCHEDULER",
  "EMPLOYEE",
  "VIEWER",
  "AUDITOR",
] as const;
export type Role = (typeof VALID_ROLES)[number];

/** The only account state that carries live permissions. */
export const ACTIVE_STATE = "active";

export type ClaimsRecord = Record<string, unknown>;

/** Minimal shape of a Firestore user document this logic depends on. */
export interface UserDocLike {
  state?: unknown;
  /** Either a string list (`["MANAGER"]`) or RoleGrant objects (`[{ role }]`). */
  roles?: unknown;
}

/**
 * Extract a sorted, de-duplicated list of valid role names from either the
 * string-list shape (written by the Admin SDK seed + in-app edits) or the
 * structured `RoleGrant[]` shape. Sorting makes downstream comparison stable.
 */
export function normalizeRoleNames(roles: unknown): Role[] {
  if (!Array.isArray(roles)) return [];
  const names = new Set<Role>();
  for (const entry of roles) {
    const name =
      typeof entry === "string"
        ? entry
        : entry && typeof entry === "object"
          ? (entry as { role?: unknown }).role
          : undefined;
    if (typeof name === "string" && (VALID_ROLES as readonly string[]).includes(name)) {
      names.add(name as Role);
    }
  }
  return Array.from(names).sort();
}

/** The role claim the document should map to (empty unless the account is active). */
export function desiredRoleClaims(userDoc: UserDocLike | undefined): Role[] {
  if (!userDoc || userDoc.state !== ACTIVE_STATE) return [];
  return normalizeRoleNames(userDoc.roles);
}

/** Canonical, comparable serialization (arrays sorted, keys sorted). */
function canonicalize(claims: ClaimsRecord): string {
  const copy: ClaimsRecord = { ...claims };
  if (Array.isArray(copy.roles)) copy.roles = [...copy.roles].map(String).sort();
  const keys = Object.keys(copy).sort();
  return JSON.stringify(keys.map((k) => [k, copy[k]]));
}

export function claimsEqual(a: ClaimsRecord, b: ClaimsRecord): boolean {
  return canonicalize(a) === canonicalize(b);
}

export interface ReconcileInput {
  /** The auth user's current custom claims (may be undefined/empty). */
  existingClaims: ClaimsRecord | undefined;
  /** The user document, or undefined when it was deleted. */
  userDoc: UserDocLike | undefined;
  /** Tenant id from the document path. */
  orgId: string;
}

export interface ReconcileResult {
  /** The complete claims object to write (only when `changed`). */
  claims: ClaimsRecord;
  /** False when the desired claims already match — skip the write (idempotent). */
  changed: boolean;
}

/**
 * Compute the custom claims a user should have. Preserves every unrelated claim,
 * adds/updates `roles` (or removes it on demotion/rejection/suspension/deletion),
 * and tags the tenant via `orgId` without ever clobbering it.
 */
export function reconcileClaims({ existingClaims, userDoc, orgId }: ReconcileInput): ReconcileResult {
  const existing: ClaimsRecord = { ...(existingClaims ?? {}) };
  const next: ClaimsRecord = { ...existing };

  const roles = desiredRoleClaims(userDoc);
  if (roles.length > 0) next.roles = roles;
  else delete next.roles;

  // Tenant tag: only for an existing account, and only when missing/mismatched.
  if (userDoc && next.orgId !== orgId) next.orgId = orgId;

  return { claims: next, changed: !claimsEqual(existing, next) };
}
