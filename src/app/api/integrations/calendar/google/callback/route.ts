import { calendarProviderStatus, getCalendarProvider } from "@/lib/integrations/calendar";
import { getCalendarTokenStore } from "@/lib/integrations/calendar-tokens";
import { appBaseUrl, redirectUriFor, verifyState } from "@/lib/integrations/calendar-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function back(req: Request, result: "connected" | "error"): Response {
  return Response.redirect(`${appBaseUrl(req)}/settings?calendar=${result}`, 302);
}

/**
 * OAuth redirect target. Google sends the user here with `code` + our signed
 * `state`; we exchange the code, store the tokens server-side, mark the profile
 * connected, and bounce back to Settings.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("error")) return back(req, "error");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return back(req, "error");

  const verified = verifyState(state);
  if (!verified) return back(req, "error");

  const store = getCalendarTokenStore();
  if (!calendarProviderStatus().configured || !store) return back(req, "error");

  try {
    const provider = getCalendarProvider();
    const tokens = await provider.exchangeCode(code, redirectUriFor(req));
    if (!tokens.accessToken) return back(req, "error");
    await store.set(verified.uid, tokens);
    await store.setConnectedFlag(verified.uid, true);
    return back(req, "connected");
  } catch {
    return back(req, "error");
  }
}
