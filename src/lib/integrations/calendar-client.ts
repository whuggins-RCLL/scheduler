"use client";

/**
 * Client helpers for the personal Google Calendar integration. These call the
 * server OAuth/sync routes with the signed-in user's Firebase ID token and,
 * for sync, compute the plan for the user's own shifts from the in-memory store
 * (the server only ever writes to the caller's own calendar).
 */

import { getFirebaseAuth } from "@/lib/firebase";
import { DEFAULT_TIMEZONE } from "@/lib/config";
import { planUserCalendarSync } from "@/lib/integrations/calendar-sync";
import type { Location, Position, Schedule, Shift, Task } from "@/domain/types";

const BASE = "/api/integrations/calendar/google";

export interface CalendarReadiness {
  oauthConfigured: boolean;
  backendConfigured: boolean;
  ready: boolean;
  missing: string[];
}

async function idToken(): Promise<string | null> {
  const auth = getFirebaseAuth();
  const user = auth?.currentUser;
  return user ? user.getIdToken() : null;
}

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

export async function fetchCalendarReadiness(): Promise<CalendarReadiness> {
  const res = await fetch(`${BASE}/status`, { cache: "no-store" });
  return res.json();
}

export type ConnectResult =
  | { ok: true }
  | { ok: false; reason: "unauthenticated" | "not_configured" | "error"; missing?: string[] };

/** Begin the OAuth flow and redirect the browser to Google's consent screen. */
export async function startCalendarConnect(): Promise<ConnectResult> {
  const token = await idToken();
  if (!token) return { ok: false, reason: "unauthenticated" };
  const res = await fetch(`${BASE}/connect`, { method: "POST", headers: authHeaders(token) });
  if (res.status === 503) {
    const body = await res.json().catch(() => ({}));
    return { ok: false, reason: "not_configured", missing: body.missing };
  }
  if (!res.ok) return { ok: false, reason: "error" };
  const { url } = (await res.json()) as { url?: string };
  if (!url) return { ok: false, reason: "error" };
  window.location.assign(url);
  return { ok: true };
}

export async function disconnectCalendar(): Promise<boolean> {
  const token = await idToken();
  if (!token) return false;
  const res = await fetch(`${BASE}/disconnect`, { method: "POST", headers: authHeaders(token) });
  return res.ok;
}

export interface SyncSources {
  shifts: Shift[];
  schedules: Schedule[];
  positions: Position[];
  locations: Location[];
  tasks: Task[];
}

export type SyncResult =
  | { ok: true; upserted: number; deleted: number }
  | { ok: false; reason: "unauthenticated" | "not_connected" | "not_configured" | "error" };

/**
 * Push the signed-in user's published shifts to their Google Calendar. Syncs
 * from a recent horizon so old history isn't backfilled.
 */
export async function syncMyCalendar(userId: string, sources: SyncSources): Promise<SyncResult> {
  const token = await idToken();
  if (!token) return { ok: false, reason: "unauthenticated" };

  const publishedScheduleIds = sources.schedules
    .filter((s) => s.status === "published")
    .map((s) => s.id);
  const scheduleNames = Object.fromEntries(sources.schedules.map((s) => [s.id, s.name]));
  const horizon = new Date();
  horizon.setDate(horizon.getDate() - 7);
  const fromDate = horizon.toISOString().slice(0, 10);

  const plan = planUserCalendarSync({
    userId,
    shifts: sources.shifts,
    publishedScheduleIds,
    positions: sources.positions,
    locations: sources.locations,
    tasks: sources.tasks,
    appBaseUrl: window.location.origin,
    timeZone: DEFAULT_TIMEZONE,
    scheduleNames,
    fromDate,
  });

  const res = await fetch(`${BASE}/sync`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ events: plan.upserts, deletions: plan.deletions }),
  });
  if (res.status === 503) return { ok: false, reason: "not_configured" };
  if (res.status === 409) return { ok: false, reason: "not_connected" };
  if (!res.ok) return { ok: false, reason: "error" };
  const body = (await res.json()) as { upserted?: number; deleted?: number };
  return { ok: true, upserted: body.upserted ?? 0, deleted: body.deleted ?? 0 };
}
