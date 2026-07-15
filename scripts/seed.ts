import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { BOOTSTRAP_ADMINS, ORGANIZATION_ID } from "../src/lib/config";

const app = initializeApp(
  process.env.GOOGLE_APPLICATION_CREDENTIALS
    ? { credential: cert(process.env.GOOGLE_APPLICATION_CREDENTIALS) }
    : { credential: applicationDefault() },
);

// Make it obvious WHERE we are writing — the #1 reason a seed "succeeds" but the
// data never appears in production is that it hit the wrong project or a running
// local emulator.
const projectId =
  app.options.projectId ??
  process.env.GOOGLE_CLOUD_PROJECT ??
  process.env.GCLOUD_PROJECT ??
  "(unknown — check GOOGLE_APPLICATION_CREDENTIALS)";
console.log(`Seeding project: ${projectId} (organization "${ORGANIZATION_ID}")`);
if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  console.warn(
    `⚠︎  Emulator env vars are set — writing to the EMULATOR, not production:\n` +
      `    FIRESTORE_EMULATOR_HOST=${process.env.FIRESTORE_EMULATOR_HOST ?? "(unset)"}\n` +
      `    FIREBASE_AUTH_EMULATOR_HOST=${process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "(unset)"}\n` +
      `    Unset them to seed production.`,
  );
}

const db = getFirestore();

async function main() {
  for (const admin of BOOTSTRAP_ADMINS) {
    const user = await getAuth()
      .getUserByEmail(admin.email)
      .catch(() => getAuth().createUser({ email: admin.email, displayName: admin.name, emailVerified: true }));
    await getAuth().setCustomUserClaims(user.uid, { roles: ["SUPER_ADMIN"], orgId: ORGANIZATION_ID });
    await db.doc(`organizations/${ORGANIZATION_ID}/users/${user.uid}`).set(
      { email: admin.email, displayName: admin.name, state: "active", roles: ["SUPER_ADMIN"], updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    console.log(`  ✓ ${admin.email} → uid ${user.uid}`);
  }
  console.log(`Seeded ${BOOTSTRAP_ADMINS.length} bootstrap administrators to ${projectId}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
