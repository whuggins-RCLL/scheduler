/**
 * Personal Google Calendar integration — one-way publish of assigned shifts.
 *
 * Follows the same shape as the hours integration: a typed provider interface,
 * a working in-memory mock (used in local/dev and unit tests), and a real
 * Google provider that only activates when OAuth credentials are configured.
 * Nothing here reads user data unless a user has explicitly connected, and no
 * secrets are committed — credentials come from the environment at call time.
 *
 * The pure pieces (event mapping, config detection, id encoding) carry no
 * network or Firebase dependency so they can be unit-tested directly.
 */

import type { Shift } from "@/domain/types";

/** OAuth path the Google redirect URI must point at (registered in Google Cloud). */
export const GOOGLE_CALENDAR_CALLBACK_PATH = "/api/integrations/calendar/google/callback";

/**
 * Minimal scope for one-way publish: create/update/delete only the events this
 * app owns on the user's calendar. We deliberately do NOT request read access
 * to their existing events.
 */
export const GOOGLE_CALENDAR_SCOPES = ["https://www.googleapis.com/auth/calendar.events"];

/** Tokens returned by Google's OAuth token endpoint (normalized). */
export interface OAuthTokens {
  accessToken: string;
  /** Only present on the first consent (access_type=offline, prompt=consent). */
  refreshToken?: string;
  /** Epoch millis when the access token expires. */
  expiresAt: number;
  scope?: string;
  tokenType?: string;
}

/** A provider-agnostic calendar event derived from a shift. */
export interface CalendarSyncEvent {
  /** Stable per-shift key, used for idempotent upserts. */
  sourceId: string;
  /** Deterministic Google event id derived from sourceId. */
  googleEventId: string;
  title: string;
  description: string;
  location: string;
  /** Naive local datetime "YYYY-MM-DDTHH:MM:SS" interpreted in `timeZone`. */
  start: string;
  end: string;
  /** IANA timezone the naive datetimes are expressed in. */
  timeZone: string;
}

/** Everything the pure mapper needs about a shift's surroundings. */
export interface ShiftEventContext {
  positionName: string;
  locationName: string;
  taskNames: string[];
  scheduleName?: string;
  scheduleVersion: number;
  /** App origin, e.g. https://scheduler.example.edu — used for the event link. */
  appBaseUrl: string;
  /** IANA timezone shifts are scheduled in. */
  timeZone: string;
}

export type CalendarProviderKind = "google" | "mock";

export interface CalendarProvider {
  readonly kind: CalendarProviderKind;
  /** Build the consent URL to send the user to. */
  getAuthUrl(state: string, redirectUri: string): string;
  /** Exchange an authorization code for tokens. */
  exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens>;
  /** Refresh the access token if it is expired (or about to be). */
  ensureAccessToken(tokens: OAuthTokens): Promise<OAuthTokens>;
  /** Create or update the event (idempotent by googleEventId). */
  upsertEvent(accessToken: string, event: CalendarSyncEvent): Promise<void>;
  /** Remove an event; treats "already gone" as success. */
  deleteEvent(accessToken: string, googleEventId: string): Promise<void>;
  /** Revoke the connection so the user's tokens stop working. */
  revoke(tokens: OAuthTokens): Promise<void>;
}

// --------------------------------------------------------------------------
// Configuration / status (pure)
// --------------------------------------------------------------------------

export interface CalendarConfig {
  clientId?: string;
  clientSecret?: string;
  configured: boolean;
}

/** Read OAuth credentials from the environment (never committed). */
export function calendarConfig(): CalendarConfig {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID || undefined;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET || undefined;
  return { clientId, clientSecret, configured: Boolean(clientId && clientSecret) };
}

/** Honest status for the admin integrations screen. */
export function calendarProviderStatus(): {
  configured: boolean;
  kind: CalendarProviderKind;
  missing: string[];
} {
  const cfg = calendarConfig();
  const missing: string[] = [];
  if (!cfg.clientId) missing.push("GOOGLE_OAUTH_CLIENT_ID");
  if (!cfg.clientSecret) missing.push("GOOGLE_OAUTH_CLIENT_SECRET");
  return { configured: cfg.configured, kind: cfg.configured ? "google" : "mock", missing };
}

// --------------------------------------------------------------------------
// Pure event mapping
// --------------------------------------------------------------------------

/** Base32hex alphabet (lowercase) — exactly the characters Google event ids allow. */
const BASE32HEX = "0123456789abcdefghijklmnopqrstuv";

/** Encode bytes as (unpadded) base32hex. */
function toBase32Hex(bytes: Uint8Array): string {
  let out = "";
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += BASE32HEX[(buffer >> bits) & 0x1f];
    }
  }
  if (bits > 0) out += BASE32HEX[(buffer << (5 - bits)) & 0x1f];
  return out;
}

/**
 * Deterministic Google event id for a shift. Google requires ids to be
 * base32hex (a-v, 0-9), 5–1024 chars; encoding guarantees validity and lets us
 * upsert the same shift idempotently without storing a mapping.
 */
export function googleEventId(sourceId: string): string {
  return "rcll" + toBase32Hex(new TextEncoder().encode(sourceId));
}

/** Stable per-shift source key. */
export function shiftSourceId(shiftId: string): string {
  return `rcll-shift-${shiftId}`;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Minute-of-day → "HH:MM:SS". */
export function minutesToClock(minutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60, Math.round(minutes)));
  return `${pad2(Math.floor(clamped / 60))}:${pad2(clamped % 60)}:00`;
}

/**
 * Map a shift to a calendar event. Times are emitted as naive local datetimes
 * paired with the IANA timezone, so Google interprets them in library time and
 * DST is handled server-side by Google (no offset math here).
 */
export function shiftToSyncEvent(shift: Shift, ctx: ShiftEventContext): CalendarSyncEvent {
  const sourceId = shiftSourceId(shift.id);
  const descLines = [
    `Position: ${ctx.positionName}`,
    `Location: ${ctx.locationName}`,
  ];
  if (ctx.taskNames.length) descLines.push(`Tasks: ${ctx.taskNames.join(", ")}`);
  if (shift.breaks.length) {
    const meal = shift.breaks.find((b) => b.kind === "meal");
    if (meal) descLines.push(`Meal break: ${minutesToClock(meal.start).slice(0, 5)}–${minutesToClock(meal.end).slice(0, 5)}`);
  }
  if (shift.notes) descLines.push(`Notes: ${shift.notes}`);
  descLines.push("");
  descLines.push(`View your schedule: ${ctx.appBaseUrl}/schedule`);
  descLines.push(`(RCLL Scheduler · published v${shift.scheduleVersion || ctx.scheduleVersion})`);

  return {
    sourceId,
    googleEventId: googleEventId(sourceId),
    title: `${ctx.positionName} — ${ctx.locationName}`,
    description: descLines.join("\n"),
    location: ctx.locationName,
    start: `${shift.date}T${minutesToClock(shift.start)}`,
    end: `${shift.date}T${minutesToClock(shift.end)}`,
    timeZone: ctx.timeZone,
  };
}

// --------------------------------------------------------------------------
// Mock provider (local/dev + tests) — no network
// --------------------------------------------------------------------------

/** Process-local event store for the mock, keyed by googleEventId. */
const mockCalendarStore = new Map<string, CalendarSyncEvent>();

/** Test/inspection helper: current mock events. */
export function _mockCalendarEvents(): CalendarSyncEvent[] {
  return [...mockCalendarStore.values()];
}
/** Test helper: reset mock state. */
export function _resetMockCalendar(): void {
  mockCalendarStore.clear();
}

export class MockCalendarProvider implements CalendarProvider {
  readonly kind = "mock" as const;

  getAuthUrl(state: string, redirectUri: string): string {
    // Round-trips straight back to the callback so a local flow can complete.
    const u = new URL(redirectUri);
    u.searchParams.set("code", "mock-auth-code");
    u.searchParams.set("state", state);
    return u.toString();
  }

  async exchangeCode(): Promise<OAuthTokens> {
    return { accessToken: "mock-access", refreshToken: "mock-refresh", expiresAt: Date.now() + 3600_000, scope: GOOGLE_CALENDAR_SCOPES.join(" ") };
  }

  async ensureAccessToken(tokens: OAuthTokens): Promise<OAuthTokens> {
    return tokens;
  }

  async upsertEvent(_accessToken: string, event: CalendarSyncEvent): Promise<void> {
    mockCalendarStore.set(event.googleEventId, event);
  }

  async deleteEvent(_accessToken: string, googleEventId: string): Promise<void> {
    mockCalendarStore.delete(googleEventId);
  }

  async revoke(): Promise<void> {
    /* nothing persisted server-side for the mock */
  }
}

// --------------------------------------------------------------------------
// Google provider (real) — only constructed when configured
// --------------------------------------------------------------------------

const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";
const GOOGLE_EVENTS_ENDPOINT = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

/** Error carrying the upstream Google status for callers to branch on. */
export class CalendarApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "CalendarApiError";
  }
}

export class GoogleCalendarProvider implements CalendarProvider {
  readonly kind = "google" as const;
  constructor(private readonly clientId: string, private readonly clientSecret: string) {}

  getAuthUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: GOOGLE_CALENDAR_SCOPES.join(" "),
      access_type: "offline",
      include_granted_scopes: "true",
      // Force a refresh token every time, so reconnecting always re-grants one.
      prompt: "consent",
      state,
    });
    return `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
  }

  async exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens> {
    const res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    if (!res.ok) throw new CalendarApiError(`Token exchange failed (${res.status})`, res.status);
    return normalizeTokenResponse(await res.json());
  }

  async ensureAccessToken(tokens: OAuthTokens): Promise<OAuthTokens> {
    if (tokens.expiresAt - Date.now() > 60_000) return tokens;
    if (!tokens.refreshToken) return tokens; // nothing we can do; caller will get a 401
    const res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: tokens.refreshToken,
        grant_type: "refresh_token",
      }),
    });
    if (!res.ok) throw new CalendarApiError(`Token refresh failed (${res.status})`, res.status);
    const refreshed = normalizeTokenResponse(await res.json());
    // Google omits the refresh_token on refresh — keep the original.
    return { ...refreshed, refreshToken: refreshed.refreshToken ?? tokens.refreshToken };
  }

  private eventBody(event: CalendarSyncEvent): Record<string, unknown> {
    return {
      id: event.googleEventId,
      summary: event.title,
      description: event.description,
      location: event.location,
      start: { dateTime: event.start, timeZone: event.timeZone },
      end: { dateTime: event.end, timeZone: event.timeZone },
      extendedProperties: { private: { rcllSource: event.sourceId } },
      reminders: { useDefault: true },
    };
  }

  async upsertEvent(accessToken: string, event: CalendarSyncEvent): Promise<void> {
    const body = JSON.stringify(this.eventBody(event));
    // Insert with a client-chosen id; if it already exists, update it in place.
    const insert = await fetch(GOOGLE_EVENTS_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body,
    });
    if (insert.ok) return;
    if (insert.status === 409) {
      const update = await fetch(`${GOOGLE_EVENTS_ENDPOINT}/${event.googleEventId}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body,
      });
      if (update.ok) return;
      throw new CalendarApiError(`Event update failed (${update.status})`, update.status);
    }
    throw new CalendarApiError(`Event insert failed (${insert.status})`, insert.status);
  }

  async deleteEvent(accessToken: string, id: string): Promise<void> {
    const res = await fetch(`${GOOGLE_EVENTS_ENDPOINT}/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    // 404/410 mean it's already gone — that's the desired end state.
    if (res.ok || res.status === 404 || res.status === 410) return;
    throw new CalendarApiError(`Event delete failed (${res.status})`, res.status);
  }

  async revoke(tokens: OAuthTokens): Promise<void> {
    const token = tokens.refreshToken ?? tokens.accessToken;
    await fetch(GOOGLE_REVOKE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
    }).catch(() => undefined); // best-effort; local record is cleared regardless
  }
}

function normalizeTokenResponse(raw: unknown): OAuthTokens {
  const r = (raw ?? {}) as Record<string, unknown>;
  const accessToken = typeof r.access_token === "string" ? r.access_token : "";
  const expiresIn = typeof r.expires_in === "number" ? r.expires_in : 3600;
  return {
    accessToken,
    refreshToken: typeof r.refresh_token === "string" ? r.refresh_token : undefined,
    expiresAt: Date.now() + expiresIn * 1000,
    scope: typeof r.scope === "string" ? r.scope : undefined,
    tokenType: typeof r.token_type === "string" ? r.token_type : undefined,
  };
}

/** Pick the live Google provider when configured, else the mock. */
export function getCalendarProvider(): CalendarProvider {
  const cfg = calendarConfig();
  if (cfg.configured && cfg.clientId && cfg.clientSecret) {
    return new GoogleCalendarProvider(cfg.clientId, cfg.clientSecret);
  }
  return new MockCalendarProvider();
}
