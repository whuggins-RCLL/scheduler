/**
 * One-time backfill: create a Firestore user document for every Firebase Auth
 * user who signed in before self-registration existed.
 *
 * The admin User management screen lists Firestore user *documents*; the browser
 * cannot enumerate Firebase Auth users (Admin SDK only). People who authenticated
 * before `ensureUserAccount` shipped therefore have an Auth account but no
 * document, so they never appear for approval. This script closes that gap:
 *
 *   - approved-domain users with no document → created as `pending_approval`
 *     (an admin then approves + assigns a role in the app),
 *   - bootstrap administrators → created active `SUPER_ADMIN` (+ custom claims),
 *   - existing documents are left untouched,
 *   - non-approved-domain accounts (e.g. personal gmail) are skipped.
 *
 * Idempotent — re-running only creates what's missing. New sign-ins self-register
 * from now on, so this is a one-time catch-up.
 *
 *   # Authenticate the Admin SDK first (either works):
 *   gcloud auth application-default login
 *   #   ...or: export GOOGLE_APPLICATION_CREDENTIALS=./service-account.json
 *   npm run backfill:users
 */
import { applicationDefault, cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { ORGANIZATION_ID } from "../src/lib/config";
import { accountIdForEmail, canonicalEmail, isApprovedDomain, isBootstrapAdmin, normalizeEmail } from "../src/lib/authz";

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
console.log(`Backfilling users into project: ${projectId} (organization "${ORGANIZATION_ID}")`);
if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  console.warn(`⚠︎  Emulator env vars are set — this targets the EMULATOR, not production. Unset them to backfill production.`);
}

const db = getFirestore();
const auth = getAuth();

async function main() {
  let created = 0;
  let admins = 0;
  let existing = 0;
  let skipped = 0;
  let pageToken: string | undefined;

  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const user of page.users) {
      const email = normalizeEmail(user.email ?? "");
      if (!email || !isApprovedDomain(email)) {
        console.log(`  – skip ${user.email ?? user.uid} (not an approved Stanford domain)`);
        skipped++;
        continue;
      }

      // Key on the canonical email so both Stanford logins share one account.
      const accountId = accountIdForEmail(email);
      const canonical = canonicalEmail(email);
      const ref = db.doc(`organizations/${ORGANIZATION_ID}/users/${accountId}`);
      const snap = await ref.get();
      if (snap.exists) {
        const data = snap.data() ?? {};
        const uids: string[] = Array.isArray(data.uids) ? data.uids : [];
        const emails: string[] = Array.isArray(data.signInEmails) ? data.signInEmails : [];
        if (!uids.includes(user.uid) || !emails.includes(email)) {
          await ref.set(
            {
              uids: FieldValue.arrayUnion(user.uid),
              signInEmails: FieldValue.arrayUnion(email),
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true },
          );
          console.log(`  ↳ linked ${email} (uid ${user.uid}) to ${accountId}`);
        }
        existing++;
        continue;
      }

      const bootstrap = isBootstrapAdmin(email);
      const roles = bootstrap ? ["SUPER_ADMIN", "MANAGER"] : [];
      const state = bootstrap ? "active" : "pending_approval";

      await ref.set({
        email: canonical,
        canonicalEmail: canonical,
        signInEmails: [email],
        uids: [user.uid],
        displayName: user.displayName ?? email,
        state,
        roles,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      if (bootstrap) {
        await auth.setCustomUserClaims(user.uid, { roles, orgId: ORGANIZATION_ID });
        admins++;
      }
      console.log(`  ✓ ${email} → ${accountId} (${state})${bootstrap ? " (SUPER_ADMIN)" : ""}`);
      created++;
    }
    pageToken = page.pageToken;
  } while (pageToken);

  console.log(
    `\nBackfill complete: ${created} created (${admins} bootstrap admins), ${existing} already had a document, ${skipped} skipped.\n` +
      `Pending users now appear under Admin → Users → "Awaiting approval".`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
