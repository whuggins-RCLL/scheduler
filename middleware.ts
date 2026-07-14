import { NextRequest, NextResponse } from "next/server";

/**
 * Client-side route protection. This is a convenience layer only — real
 * authorization is enforced server-side (Firestore rules + Cloud Functions).
 *
 * When Firebase is not configured (local/demo mode), there is no auth session
 * to gate on, so enforcement is bypassed and the demo workspace is fully
 * navigable. Once `NEXT_PUBLIC_FIREBASE_PROJECT_ID` is set, cookie-based checks
 * mirror the server decision and redirect to /login or /pending as appropriate.
 */
const protectedPrefixes = [
  "/dashboard",
  "/schedule",
  "/availability",
  "/leave",
  "/swaps",
  "/tasks",
  "/team",
  "/reports",
  "/settings",
  "/admin",
];

const FIREBASE_CONFIGURED = Boolean(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);

export function middleware(req: NextRequest) {
  if (!FIREBASE_CONFIGURED) return NextResponse.next(); // demo mode

  const path = req.nextUrl.pathname;
  if (!protectedPrefixes.some((p) => path.startsWith(p))) return NextResponse.next();

  const state = req.cookies.get("cs_account_state")?.value;
  const roles = (req.cookies.get("cs_roles")?.value ?? "").split(",");
  if (!state) return NextResponse.redirect(new URL("/login", req.url));
  if (state === "pending_approval") return NextResponse.redirect(new URL("/pending", req.url));
  if (path.startsWith("/admin") && !roles.includes("SUPER_ADMIN") && !roles.includes("MANAGER")) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
