/**
 * Server-side storage for per-user Google Calendar OAuth tokens.
 *
 * Tokens are secrets, so they live in Firestore written via the Admin SDK
 * (which bypasses security rules) and are never exposed to the client — the
 * `calendarConnections` collection is denied to all clients in firestore.rules.
 *
 * Everything is env-gated: with no Admin credentials configured (local/dev),
 * `getCalendarTokenStore()` returns null and the OAuth routes degrade to an
 * honest "not configured" response instead of throwing.
 */

import { cert, getApp, getApps, initializeApp, applicationDefault, type App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import type { OAuthTokens } from "./calendar";

const ORG_ID = process.env.NEXT_PUBLIC_ORGANIZATION_ID || "rcll";
const ADMIN_APP_NAME = "calendar-admin";

export interface CalendarTokenStore {
  get(userId: string): Promise<OAuthTokens | null>;
  set(userId: string, tokens: OAuthTokens): Promise<void>;
  remove(userId: string): Promise<void>;
  /** Reflect connection state on the employee profile the UI reads. */
  setConnectedFlag(userId: string, connected: boolean): Promise<void>;
}

/** Lazily initialize (and cache) a dedicated Admin app, or null if unconfigured. */
export function getAdminApp(): App | null {
  if (getApps().some((a) => a.name === ADMIN_APP_NAME)) return getApp(ADMIN_APP_NAME);

  const projectId =
    process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || undefined;

  try {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (serviceAccountJson) {
      const parsed = JSON.parse(serviceAccountJson);
      return initializeApp({ credential: cert(parsed), projectId }, ADMIN_APP_NAME);
    }
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      return initializeApp({ credential: applicationDefault(), projectId }, ADMIN_APP_NAME);
    }
  } catch {
    // Bad/absent credentials → treated as not configured.
    return null;
  }
  return null;
}

function connectionPath(userId: string): string[] {
  return ["organizations", ORG_ID, "calendarConnections", userId];
}
function profilePath(userId: string): string[] {
  return ["organizations", ORG_ID, "employeeProfiles", userId];
}

export function getCalendarTokenStore(): CalendarTokenStore | null {
  const app = getAdminApp();
  if (!app) return null;
  const db = getFirestore(app);

  return {
    async get(userId) {
      const snap = await db.doc(connectionPath(userId).join("/")).get();
      if (!snap.exists) return null;
      const d = snap.data() ?? {};
      if (typeof d.accessToken !== "string") return null;
      return {
        accessToken: d.accessToken,
        refreshToken: typeof d.refreshToken === "string" ? d.refreshToken : undefined,
        expiresAt: typeof d.expiresAt === "number" ? d.expiresAt : 0,
        scope: typeof d.scope === "string" ? d.scope : undefined,
      };
    },
    async set(userId, tokens) {
      await db.doc(connectionPath(userId).join("/")).set(
        {
          userId,
          accessToken: tokens.accessToken,
          // Keep any existing refresh token if Google didn't return a new one.
          ...(tokens.refreshToken ? { refreshToken: tokens.refreshToken } : {}),
          expiresAt: tokens.expiresAt,
          scope: tokens.scope ?? null,
          updatedAt: Date.now(),
        },
        { merge: true },
      );
    },
    async remove(userId) {
      await db.doc(connectionPath(userId).join("/")).delete();
    },
    async setConnectedFlag(userId, connected) {
      await db.doc(profilePath(userId).join("/")).set(
        { googleCalendarConnected: connected },
        { merge: true },
      );
    },
  };
}
