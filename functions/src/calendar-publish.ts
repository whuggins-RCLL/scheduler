/**
 * Server-side push of a published schedule to every connected assignee's
 * personal Google Calendar. Fires from the schedules Firestore trigger the
 * instant a schedule is published — reliable and independent of whether the
 * publishing manager's browser stays open (unlike the client-side push).
 *
 * Reuses the exact pure planner and Google provider from the app
 * (`../../src/lib/integrations/*`), so events are byte-identical to the
 * client push: deterministic event ids make the two idempotent and
 * non-duplicating. Reads each user's token from `calendarConnections`, which
 * only the server can access.
 */

import type { Firestore } from "firebase-admin/firestore";
import {
  CalendarApiError,
  GoogleCalendarProvider,
  calendarConfig,
  type OAuthTokens,
} from "../../src/lib/integrations/calendar";
import { planPublishedScheduleSync } from "../../src/lib/integrations/calendar-sync";
import { DEFAULT_TIMEZONE } from "../../src/lib/config";
import type { Shift } from "../../src/domain/types";

type DocData = Record<string, unknown> | undefined;

/**
 * Fire only when a schedule becomes — or is re-published at a new version —
 * `published`. Pure so it can be unit tested; the trigger writes nothing back
 * to the schedule doc, so there is no self-refire.
 */
export function shouldSyncOnScheduleWrite(before: DocData, after: DocData): boolean {
  if (!after || after.status !== "published") return false;
  if (!before || before.status !== "published") return true;
  return before.publishedVersion !== after.publishedVersion || before.version !== after.version;
}

function tokensFrom(data: DocData): OAuthTokens | null {
  if (!data || typeof data.accessToken !== "string") return null;
  return {
    accessToken: data.accessToken,
    refreshToken: typeof data.refreshToken === "string" ? data.refreshToken : undefined,
    expiresAt: typeof data.expiresAt === "number" ? data.expiresAt : 0,
    scope: typeof data.scope === "string" ? data.scope : undefined,
  };
}

interface NamedSnap {
  docs: { id: string; data: () => Record<string, unknown> }[];
}
function named(snap: NamedSnap): { id: string; name: string }[] {
  return snap.docs.map((d) => ({ id: d.id, name: String(d.data().name ?? "") }));
}

export interface PublishSyncSummary {
  synced: number;
  skipped: number;
  disconnected: number;
  failed: number;
}

/**
 * Read the published schedule's shifts + reference data, plan per assignee, and
 * push to each connected assignee's calendar with their own stored token.
 * Users who haven't connected are skipped; a revoked grant flips their profile
 * flag off. Idempotent, so it may safely re-run.
 */
export async function handlePublishedSchedule(
  db: Firestore,
  orgId: string,
  scheduleId: string,
): Promise<PublishSyncSummary> {
  const summary: PublishSyncSummary = { synced: 0, skipped: 0, disconnected: 0, failed: 0 };
  const cfg = calendarConfig();
  if (!cfg.configured || !cfg.clientId || !cfg.clientSecret) return summary;

  const base = `organizations/${orgId}`;
  const [shiftsSnap, positionsSnap, locationsSnap, tasksSnap] = await Promise.all([
    db.collection(`${base}/shifts`).where("scheduleId", "==", scheduleId).get(),
    db.collection(`${base}/positions`).get(),
    db.collection(`${base}/locations`).get(),
    db.collection(`${base}/tasks`).get(),
  ]);
  const shifts = shiftsSnap.docs.map((d) => ({ ...(d.data() as object), id: d.id }) as Shift);

  const plans = planPublishedScheduleSync({
    scheduleId,
    shifts,
    positions: named(positionsSnap),
    locations: named(locationsSnap),
    tasks: named(tasksSnap),
    appBaseUrl: process.env.APP_BASE_URL ?? "",
    timeZone: DEFAULT_TIMEZONE,
  });
  if (plans.length === 0) return summary;

  const provider = new GoogleCalendarProvider(cfg.clientId, cfg.clientSecret);
  for (const plan of plans) {
    const connRef = db.doc(`${base}/calendarConnections/${plan.userId}`);
    const snap = await connRef.get();
    let tokens = tokensFrom(snap.exists ? (snap.data() as DocData) : undefined);
    if (!tokens) {
      summary.skipped++;
      continue;
    }
    try {
      const refreshed = await provider.ensureAccessToken(tokens);
      if (refreshed.accessToken !== tokens.accessToken) {
        await connRef.set(
          {
            accessToken: refreshed.accessToken,
            expiresAt: refreshed.expiresAt,
            ...(refreshed.refreshToken ? { refreshToken: refreshed.refreshToken } : {}),
          },
          { merge: true },
        );
        tokens = refreshed;
      }
      for (const ev of plan.upserts) await provider.upsertEvent(tokens.accessToken, ev);
      for (const id of plan.deletions) await provider.deleteEvent(tokens.accessToken, id);
      summary.synced++;
    } catch (err) {
      if (err instanceof CalendarApiError && (err.status === 401 || err.status === 403)) {
        await db
          .doc(`${base}/employeeProfiles/${plan.userId}`)
          .set({ googleCalendarConnected: false }, { merge: true })
          .catch(() => undefined);
        summary.disconnected++;
      } else {
        summary.failed++;
      }
    }
  }
  return summary;
}
