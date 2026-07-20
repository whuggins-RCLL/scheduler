import { randomUUID } from "node:crypto";
import { calendarProviderStatus, getCalendarProvider } from "@/lib/integrations/calendar";
import { getCalendarTokenStore } from "@/lib/integrations/calendar-tokens";
import { bearerToken, redirectUriFor, signState, verifyCaller } from "@/lib/integrations/calendar-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Begin the OAuth flow: verify the signed-in caller, then hand back the Google
 * consent URL for the client to redirect to. Degrades to configured:false when
 * OAuth credentials or the Admin backend aren't set up.
 */
export async function POST(req: Request) {
  const status = calendarProviderStatus();
  const store = getCalendarTokenStore();
  if (!status.configured || !store) {
    const missing = [...status.missing];
    if (!store) missing.push("Firebase Admin credentials");
    return Response.json({ configured: false, missing }, { status: 503 });
  }

  const caller = await verifyCaller(bearerToken(req));
  if (!caller) return Response.json({ error: "unauthorized" }, { status: 401 });

  const state = signState(caller.uid, randomUUID());
  const url = getCalendarProvider().getAuthUrl(state, redirectUriFor(req));
  return Response.json({ configured: true, url });
}
