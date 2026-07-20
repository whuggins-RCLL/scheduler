/**
 * Server-only helpers for the calendar OAuth routes: caller identity (Firebase
 * ID token verification) and tamper-proof OAuth `state` (HMAC-signed), plus
 * request-derived redirect/base URLs. Kept apart from the pure adapter so the
 * Node-only Admin SDK and crypto stay out of testable/client code.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { getAuth } from "firebase-admin/auth";
import { getAdminApp } from "./calendar-tokens";
import { GOOGLE_CALENDAR_CALLBACK_PATH } from "./calendar";
import { isBootstrapAdmin } from "@/lib/authz";

export interface Caller {
  uid: string;
  email?: string;
  /** Role names from the verified custom claims (empty if none). */
  roles: string[];
}

/** Verify a Firebase ID token and return the caller, or null if unverifiable. */
export async function verifyCaller(idToken: string | null | undefined): Promise<Caller | null> {
  if (!idToken) return null;
  const app = getAdminApp();
  if (!app) return null;
  try {
    const decoded = await getAuth(app).verifyIdToken(idToken);
    const roles = Array.isArray(decoded.roles)
      ? (decoded.roles as unknown[]).filter((r): r is string => typeof r === "string")
      : [];
    return { uid: decoded.uid, email: decoded.email, roles };
  } catch {
    return null;
  }
}

const MANAGER_ROLE_NAMES = new Set(["SUPER_ADMIN", "MANAGER", "SCHEDULER"]);

/**
 * Whether the verified caller may publish schedules (and therefore trigger a
 * calendar push to assignees). Mirrors `canManage` on the client plus the
 * bootstrap-admin break-glass, but decided server-side from trusted claims.
 */
export function callerCanManage(caller: Caller): boolean {
  if (caller.email && isBootstrapAdmin(caller.email)) return true;
  return caller.roles.some((r) => MANAGER_ROLE_NAMES.has(r));
}

/** Extract a bearer token from an Authorization header. */
export function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

function stateSecret(): string {
  return process.env.CALENDAR_STATE_SECRET || process.env.GOOGLE_OAUTH_CLIENT_SECRET || "";
}

/** Sign `{uid}` into an opaque state string the callback can trust. */
export function signState(uid: string, nonce: string): string {
  const payload = `${uid}.${nonce}`;
  const mac = createHmac("sha256", stateSecret()).update(payload).digest("base64url");
  return `${Buffer.from(payload).toString("base64url")}.${mac}`;
}

/** Verify a signed state string and return its uid, or null if invalid. */
export function verifyState(state: string): { uid: string } | null {
  const [body, mac] = state.split(".");
  if (!body || !mac) return null;
  let payload: string;
  try {
    payload = Buffer.from(body, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const expected = createHmac("sha256", stateSecret()).update(payload).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const uid = payload.split(".")[0];
  return uid ? { uid } : null;
}

/** App origin for building the OAuth redirect URI and event links. */
export function appBaseUrl(req: Request): string {
  return process.env.APP_BASE_URL || new URL(req.url).origin;
}

export function redirectUriFor(req: Request): string {
  return `${appBaseUrl(req)}${GOOGLE_CALENDAR_CALLBACK_PATH}`;
}
