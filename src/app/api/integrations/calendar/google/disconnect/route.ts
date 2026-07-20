import { getCalendarProvider } from "@/lib/integrations/calendar";
import { getCalendarTokenStore } from "@/lib/integrations/calendar-tokens";
import { bearerToken, verifyCaller } from "@/lib/integrations/calendar-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Revoke the caller's Google grant and clear their stored tokens + flag. */
export async function POST(req: Request) {
  const store = getCalendarTokenStore();
  if (!store) return Response.json({ configured: false }, { status: 503 });

  const caller = await verifyCaller(bearerToken(req));
  if (!caller) return Response.json({ error: "unauthorized" }, { status: 401 });

  const tokens = await store.get(caller.uid);
  if (tokens) {
    try {
      await getCalendarProvider().revoke(tokens);
    } catch {
      // Best effort — clear our record regardless of Google's response.
    }
  }
  await store.remove(caller.uid);
  await store.setConnectedFlag(caller.uid, false);
  return Response.json({ ok: true });
}
