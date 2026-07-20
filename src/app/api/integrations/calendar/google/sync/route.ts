import {
  CalendarApiError,
  getCalendarProvider,
  type CalendarSyncEvent,
} from "@/lib/integrations/calendar";
import { getCalendarTokenStore } from "@/lib/integrations/calendar-tokens";
import { bearerToken, verifyCaller } from "@/lib/integrations/calendar-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isEvent(v: unknown): v is CalendarSyncEvent {
  if (typeof v !== "object" || v === null) return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.googleEventId === "string" &&
    typeof e.title === "string" &&
    typeof e.start === "string" &&
    typeof e.end === "string" &&
    typeof e.timeZone === "string"
  );
}

/**
 * Apply a one-way sync plan to the caller's Google Calendar. The client (which
 * holds the schedule data) computes the plan for its own shifts; the server
 * only ever writes to the authenticated caller's own calendar using tokens it
 * alone holds.
 */
export async function POST(req: Request) {
  const store = getCalendarTokenStore();
  if (!store) return Response.json({ configured: false }, { status: 503 });

  const caller = await verifyCaller(bearerToken(req));
  if (!caller) return Response.json({ error: "unauthorized" }, { status: 401 });

  let tokens = await store.get(caller.uid);
  if (!tokens) return Response.json({ connected: false }, { status: 409 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const events = Array.isArray(body.events) ? body.events.filter(isEvent) : [];
  const deletions = Array.isArray(body.deletions)
    ? body.deletions.filter((d): d is string => typeof d === "string")
    : [];

  const provider = getCalendarProvider();
  try {
    const refreshed = await provider.ensureAccessToken(tokens);
    if (refreshed.accessToken !== tokens.accessToken) {
      await store.set(caller.uid, refreshed);
      tokens = refreshed;
    }

    let upserted = 0;
    for (const event of events) {
      await provider.upsertEvent(tokens.accessToken, event);
      upserted++;
    }
    let deleted = 0;
    for (const id of deletions) {
      await provider.deleteEvent(tokens.accessToken, id);
      deleted++;
    }
    return Response.json({ ok: true, upserted, deleted });
  } catch (err) {
    // An auth failure means the grant was revoked outside the app — reflect that.
    if (err instanceof CalendarApiError && (err.status === 401 || err.status === 403)) {
      await store.setConnectedFlag(caller.uid, false);
      return Response.json({ connected: false }, { status: 409 });
    }
    return Response.json({ error: "sync_failed" }, { status: 502 });
  }
}
