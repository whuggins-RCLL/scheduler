/**
 * One-time backfill: reconcile Firebase Auth custom claims for every existing
 * user document. Run once after deploying `syncUserClaims` so already-approved
 * accounts (created before the trigger existed) get their `roles` claim, and
 * suspended/revoked accounts get theirs removed.
 *
 * Uses the SAME pure reconciliation logic as the trigger, so it is idempotent —
 * re-running only writes accounts whose claims are out of sync.
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json npm run backfill:claims
 */
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { ORGANIZATION_ID } from "../src/lib/config";
import { reconcileClaims } from "../functions/src/claims";

if (!getApps().length) {
  initializeApp(
    process.env.GOOGLE_APPLICATION_CREDENTIALS
      ? { credential: cert(process.env.GOOGLE_APPLICATION_CREDENTIALS) }
      : undefined,
  );
}

const db = getFirestore();
const auth = getAuth();

async function main() {
  const snap = await db.collection(`organizations/${ORGANIZATION_ID}/users`).get();
  let updated = 0;
  let inSync = 0;
  let missing = 0;

  for (const doc of snap.docs) {
    const uid = doc.id;
    const email = (doc.data().email as string | undefined) ?? "(no email)";
    let existingClaims: Record<string, unknown> | undefined;
    try {
      existingClaims = (await auth.getUser(uid)).customClaims ?? {};
    } catch {
      console.warn(`⚠︎  ${uid} (${email}): no matching auth user — skipping`);
      missing++;
      continue;
    }

    const { claims, changed } = reconcileClaims({
      existingClaims,
      userDoc: doc.data(),
      orgId: ORGANIZATION_ID,
    });

    if (!changed) {
      inSync++;
      continue;
    }

    await auth.setCustomUserClaims(uid, claims);
    await auth.revokeRefreshTokens(uid);
    console.log(`✓  ${uid} (${email}) → roles=${JSON.stringify(claims.roles ?? [])}`);
    updated++;
  }

  console.log(
    `\nBackfill complete: ${updated} updated, ${inSync} already in sync, ${missing} without an auth user.`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
