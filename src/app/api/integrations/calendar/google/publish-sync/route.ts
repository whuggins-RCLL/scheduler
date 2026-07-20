import {
  CalendarApiError,
  getCalendarProvider,
  type CalendarSyncEvent,
} from "@/lib/integrations/calendar";
import { getCalendarTokenStore } from "@/lib/integrations/calendar-tokens";
import { bearerToken, callerCanManage, verifyCaller } from "@/lib/integrations/calendar-server";

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

interface UserPlan {
  userId: string;
  upserts: CalendarSyncEvent[];
  deletions: string[];
}

function parsePlans(raw: unknown): UserPlan[] {
  if (!Array.isArray(raw)) return [];
  const out: UserPlan[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.userId !== "string") continue;
    out.push({
      userId: e.userId,
      upserts: Array.isArray(e.upserts) ? e.upserts.filter(isEvent) : [],
      deletions: Array.isArray(e.deletions) ? e.deletions.filter((d): d is string => typeof d === "string") : [],
    });
  }
  return out;
}

/**
 * Push a just-published schedule to every connected assignee's Google Calendar,
 * the moment a manager publishes. Manager/admin-gated; each person's shifts are
 * written using that person's own stored token (only for those who opted in by
 * connecting). Callers who haven't connected are skipped, not failed.
 *
 * The publishing manager's client computes the per-assignee plans (it holds the
 * schedule data) and posts them here; the server never fabricates events for a
 * user who hasn't connected.
 */
export async function POST(req: Request) {
  const store = getCalendarTokenStore();
  if (!store) return Response.json({ configured: false }, { status: 503 });

  const caller = await verifyCaller(bearerToken(req));
  if (!caller) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!callerCanManage(caller)) return Response.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const plans = parsePlans(body.plans);

  const provider = getCalendarProvider();
  let synced = 0;
  let skipped = 0;
  let disconnected = 0;
  let failed = 0;

  for (const plan of plans) {
    try {
      let tokens = await store.get(plan.userId);
      if (!tokens) {
        skipped++; // not connected — nothing to do
        continue;
      }
      const refreshed = await provider.ensureAccessToken(tokens);
      if (refreshed.accessToken !== tokens.accessToken) {
        await store.set(plan.userId, refreshed);
        tokens = refreshed;
      }
      for (const event of plan.upserts) await provider.upsertEvent(tokens.accessToken, event);
      for (const id of plan.deletions) await provider.deleteEvent(tokens.accessToken, id);
      synced++;
    } catch (err) {
      if (err instanceof CalendarApiError && (err.status === 401 || err.status === 403)) {
        // The user's grant was revoked outside the app — reflect it and move on.
        await store.setConnectedFlag(plan.userId, false).catch(() => undefined);
        disconnected++;
      } else {
        failed++;
      }
    }
  }

  return Response.json({ ok: true, synced, skipped, disconnected, failed });
}
