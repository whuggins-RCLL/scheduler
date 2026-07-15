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
 */
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { logger, setGlobalOptions } from "firebase-functions/v2";
import { reconcileClaims } from "./claims";

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
