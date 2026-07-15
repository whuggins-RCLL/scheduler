/**
 * Firebase Cloud Functions for RCLL Scheduler.
 *
 * `syncUserClaims` keeps Firebase Auth custom claims in lockstep with each
 * user's Firestore record. The app writes role/approval changes to the user
 * document (which drives its own UI gating); this trigger mirrors them onto the
 * `roles` custom claim that `firestore.rules` enforce at the database layer, so
 * an approved manager can actually write manager-gated collections.
 *
 * A single `onDocumentWritten` trigger covers every transition:
 *   - create / approval  → grants the role claim,
 *   - role change (demotion / promotion) → updates it,
 *   - suspension / rejection (state ≠ active) → removes it,
 *   - document deletion   → removes it.
 * The write is skipped whenever the claims already match (idempotent), and all
 * unrelated claims are preserved. See `claims.ts` for the pure logic + tests.
 *
 * `provisionMissingUsers` creates a Firestore user document for every Firebase
 * Auth user who signed in before the app started writing documents — the in-app
 * equivalent of `npm run backfill:users`. It is driven by a Firestore trigger
 * (not an HTTPS callable) so it works in locked-down GCP orgs where Cloud Run
 * services cannot be made publicly invokable: an admin writes a request document
 * (allowed by the security rules), the trigger runs internally and writes the
 * result back. No public HTTP surface, so no CORS / org-policy issues.
 */
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { logger, setGlobalOptions } from "firebase-functions/v2";
import { reconcileClaims } from "./claims";
import {
  ORGANIZATION_ID,
  isApprovedDomain,
  isBootstrapAdminEmail,
  normalizeEmail,
} from "./provision";

if (!getApps().length) initializeApp();
setGlobalOptions({ region: "us-central1" });

export const syncUserClaims = onDocumentWritten(
  "organizations/{orgId}/users/{userId}",
  async (event) => {
    const { orgId, userId } = event.params as { orgId: string; userId: string };
    const after = event.data?.after;
    const userDoc = after?.exists ? after.data() : undefined; // undefined => deleted

    const auth = getAuth();
    let existingClaims: Record<string, unknown> | undefined;
    try {
      const user = await auth.getUser(userId);
      existingClaims = user.customClaims ?? {};
    } catch (err) {
      // No matching auth user (e.g. a placeholder doc, or the auth user was
      // deleted first). Nothing to reconcile.
      logger.warn(`syncUserClaims: no auth user for ${userId}; skipping`, err);
      return;
    }

    const { claims, changed } = reconcileClaims({ existingClaims, userDoc, orgId });
    if (!changed) {
      logger.debug(`syncUserClaims: claims already in sync for ${userId}`);
      return;
    }

    await auth.setCustomUserClaims(userId, claims);
    // Force existing sessions to pick up the new claims on their next refresh,
    // so a demotion or revocation takes effect promptly instead of after ~1h.
    await auth.revokeRefreshTokens(userId);
    logger.info(`syncUserClaims: updated claims for ${userId}`, {
      roles: claims.roles ?? [],
    });
  },
);

export interface ProvisionResult {
  created: number;
  admins: number;
  existing: number;
  skipped: number;
}

/**
 * Create a Firestore user document for every Firebase Auth user who lacks one
 * (people who signed in before the app wrote documents). Approved-domain users
 * become `pending_approval`; bootstrap admins become active `SUPER_ADMIN` (the
 * syncUserClaims trigger then grants their claim from the new document).
 * Non-approved-domain accounts are skipped, existing documents are left
 * untouched, and the whole thing is idempotent.
 */
async function provisionMissingUserDocs(orgId: string): Promise<ProvisionResult> {
  const auth = getAuth();
  const db = getFirestore();
  const result: ProvisionResult = { created: 0, admins: 0, existing: 0, skipped: 0 };
  let pageToken: string | undefined;

  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const user of page.users) {
      const email = normalizeEmail(user.email ?? "");
      if (!email || !isApprovedDomain(email)) {
        result.skipped++;
        continue;
      }
      const ref = db.doc(`organizations/${orgId}/users/${user.uid}`);
      if ((await ref.get()).exists) {
        result.existing++;
        continue;
      }
      const bootstrap = isBootstrapAdminEmail(email);
      await ref.set({
        email,
        displayName: user.displayName ?? email,
        state: bootstrap ? "active" : "pending_approval",
        roles: bootstrap ? ["SUPER_ADMIN"] : [],
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      if (bootstrap) result.admins++;
      result.created++;
    }
    pageToken = page.pageToken;
  } while (pageToken);

  return result;
}

/**
 * Trigger-driven "import sign-ins": an administrator writes a request document
 * to `organizations/{orgId}/maintenance/{taskId}` (create is admin-only per the
 * security rules). This trigger runs the backfill and writes the result back to
 * the same document, which the app watches. Using a Firestore trigger instead of
 * an HTTPS callable avoids needing a publicly-invokable Cloud Run service — the
 * kind of public access that university GCP org policies block (and that
 * produced CORS failures for the callable version).
 */
export const provisionMissingUsers = onDocumentWritten(
  "organizations/{orgId}/maintenance/{taskId}",
  async (event) => {
    const { orgId } = event.params as { orgId: string; taskId: string };
    const after = event.data?.after;
    if (!after?.exists) return;
    const data = after.data() ?? {};
    // Only act on a fresh request; our own result write (status "done"/"error")
    // re-fires this trigger and must be ignored to avoid a loop.
    if (data.type !== "provisionUsers" || data.status !== "requested") return;

    try {
      const result = await provisionMissingUserDocs(orgId);
      logger.info(`provisionMissingUsers by ${data.requestedBy ?? "?"}`, result);
      await after.ref.set(
        { status: "done", result, completedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
    } catch (err) {
      logger.error("provisionMissingUsers failed", err);
      await after.ref.set(
        {
          status: "error",
          error: err instanceof Error ? err.message : String(err),
          completedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }
  },
);
