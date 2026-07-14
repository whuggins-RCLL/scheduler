import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

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

export function getDb(): Firestore | null {
  const app = getFirebaseApp();
  return app ? getFirestore(app) : null;
}

export async function signInWithGoogle() {
  const auth = getFirebaseAuth();
  if (!auth) {
    throw new Error("Firebase is not configured in this environment.");
  }
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ hd: "stanford.edu" });
  return signInWithPopup(auth, provider);
}
