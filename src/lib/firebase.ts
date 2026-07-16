import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, type Auth } from "firebase/auth";
import { getFirestore, initializeFirestore, type Firestore } from "firebase/firestore";

export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/** True only when a real Firebase project is configured (production). */
export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

/**
 * Firebase is initialized lazily and only when configured, so the app builds
 * and runs in local/demo mode without credentials (no module-load throw during
 * prerender).
 */
export function getFirebaseApp(): FirebaseApp | null {
  if (!isFirebaseConfigured) return null;
  return getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
}

export function getFirebaseAuth(): Auth | null {
  const app = getFirebaseApp();
  return app ? getAuth(app) : null;
}

let firestore: Firestore | null = null;

export function getDb(): Firestore | null {
  const app = getFirebaseApp();
  if (!app) return null;
  if (firestore) return firestore;
  // `ignoreUndefinedProperties` makes writes drop `undefined` fields instead of
  // throwing "Unsupported field value: undefined". Optional profile/pattern
  // fields (e.g. notificationPrefs.quietHoursStart) are legitimately undefined,
  // and Firestore rejects those unless we opt in here. initializeFirestore must
  // run before the first getFirestore, so we cache the instance and fall back if
  // Firestore was already initialized elsewhere.
  try {
    firestore = initializeFirestore(app, { ignoreUndefinedProperties: true });
  } catch {
    firestore = getFirestore(app);
  }
  return firestore;
}

export async function signInWithGoogle() {
  const auth = getFirebaseAuth();
  if (!auth) {
    throw new Error("Firebase is not configured in this environment.");
  }
  const provider = new GoogleAuthProvider();
  // Always show the Google account chooser. Staff commonly have more than one
  // Google identity (e.g. @stanford.edu AND @law.stanford.edu), and we must let
  // them pick which one to sign in with. We deliberately do NOT pin a single
  // `hd` hosted-domain hint — that biased sign-in toward one domain and quietly
  // defaulted people to the wrong account. Approved-domain enforcement happens
  // after sign-in (`isApprovedDomain`) and in Firestore rules, so both Stanford
  // domains are accepted and anything else is rejected regardless of choice.
  provider.setCustomParameters({ prompt: "select_account" });
  return signInWithPopup(auth, provider);
}
