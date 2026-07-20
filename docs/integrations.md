# RCLL Scheduler — Integrations

Every external integration is built behind a **typed adapter interface** with a
**working mock provider**, an **admin configuration screen**, graceful
disconnected/error states, and no committed secrets. Live providers activate
when credentials are supplied.

## LibCal operating hours

`src/lib/integrations/hours.ts` defines the `HoursProvider` interface and the
normalized `OperationalHoursInterval` shape. Providers:

- `ManualHoursProvider` — manager-entered hours (authoritative by default).
- `LibCalHoursProvider` — fetches + normalizes the LibCal JSON-LD hours feed
  (`src/lib/integrations/libcal-hours.ts`, `normalizeLibCalJsonLd`, tested in
  `tests/libcal-hours.test.ts`). Served through `app/api/integrations/libcal/hours`.
- `MockHoursProvider` — deterministic sample data for local/dev.

Behavior: cache retrieved hours in Firestore with source + retrieval time +
sync status; **never silently overwrite** manager-created exceptions; surface
discrepancies; let an admin choose the authoritative source; manual + scheduled
sync. The LibCal widget is only an optional visual fallback, never the sole
scheduling source. The scheduler will not place service-point shifts outside
operating hours unless a manager explicitly overrides for open/close/after-hours.

Admin screen: `/admin/integrations` renders `LibCalHoursPanel` and the provider
status. Env: `LIBCAL_HOURS_JSON_URL` (defaulted to the RCLL LibCal grid feed,
location id `2457`).

### Desk-coverage buffer (+2h rule)

Operations require the service desk to remain staffed past the library's
*staffed* closing time. `deskCoverageInterval` / `deriveDeskCoverage`
(`src/lib/integrations/libcal-hours.ts`) extend the LibCal close by
`DESK_COVERAGE_BUFFER_MINUTES` (default **120 min**): e.g. LibCal staffed close
3:00pm → desk coverage until 5:00pm. Configurable via `config.ts`; proven in
`tests/desk-coverage.test.ts`.

## Library operations calendar (Google)

The shared Google operations calendar is wired for **viewing today**:

- **Public embed** — `GOOGLE_CALENDAR_EMBED_SRC` (in `config.ts`; safe to
  expose) renders in an accessible iframe at `/calendar` (`CalendarEmbed`).
- **Event import** — `/api/integrations/calendar/ics` fetches the **secret**
  iCal feed from `GOOGLE_CALENDAR_ICAL_URL` (server-side only, never committed;
  add it in Vercel → Environment Variables), parses VEVENTs with a dependency-free
  ICS parser, and returns upcoming events. Graceful "not configured" and
  unreachable-feed states; the secret URL is never logged or returned.

## Personal Google Calendar sync (one-way publish)

Status: **built** — a typed adapter + working mock ship today; the live Google
provider activates automatically once credentials are configured (below). Each
user connects their **own** Google Calendar from **Settings**; their **published**
shifts are written to it. It is strictly one-way (shifts out only) — the app
requests no read access to anyone's calendar.

### How it works

- **Adapter** — `src/lib/integrations/calendar.ts` defines `CalendarProvider`
  with a `MockCalendarProvider` (local/dev + tests, no network) and a
  `GoogleCalendarProvider` (real OAuth + Calendar API). `getCalendarProvider()`
  returns Google when `GOOGLE_OAUTH_CLIENT_ID`/`GOOGLE_OAUTH_CLIENT_SECRET` are
  set, else the mock. The pure event mapping (`shiftToSyncEvent`) and planner
  (`src/lib/integrations/calendar-sync.ts`, `planUserCalendarSync`) are unit
  tested in `tests/calendar-integration.test.ts`.
- **Events** carry position, location, tasks, meal break, notes, a link back to
  the schedule, and the published version. Times are emitted as naive local
  datetimes plus the library IANA timezone, so Google handles DST. Each shift
  maps to a **deterministic** Google event id, so re-syncing updates in place
  (idempotent) and a cancelled shift is removed.
- **OAuth routes** (`src/app/api/integrations/calendar/google/*`):
  `connect` (returns the consent URL for the signed-in caller), `callback`
  (exchanges the code, stores tokens, marks the profile connected), `disconnect`
  (revokes + clears), `sync` (applies a plan to the caller's calendar), and
  `status` (non-secret readiness for the admin/settings screens). All degrade to
  an honest "not configured" response when credentials are absent.
- **Tokens** are secrets: stored via the Firebase Admin SDK in
  `organizations/{org}/calendarConnections/{uid}`, which `firestore.rules`
  denies to every client. The caller is authenticated by verifying their
  Firebase ID token; the OAuth `state` is HMAC-signed to prevent CSRF.
- **Triggering** happens two ways, both reusing the same pure planner:
  - *Per-user pull* — the signed-in user's shifts sync when they open the
    scheduler, on connect, and via **Sync now** (`/sync`, writes only the
    caller's own calendar).
  - *Push on publish* — when a manager publishes a schedule, their client
    computes the plan for every assignee (`planPublishedScheduleSync`) and posts
    it to `/publish-sync`. That route is **manager/admin-gated** (verified from
    the caller's role claims) and writes each assignee's shifts using that
    person's own stored token — only for those who have connected; everyone else
    is skipped. So a connected employee's calendar updates the moment the
    schedule goes out, without waiting for them to open the app.
  - The push runs from the publishing manager's browser. If it's interrupted
    (tab closed mid-run), the per-user pull still catches any stragglers. Moving
    the push into a Firestore-triggered Cloud Function would make it fully
    server-side, but that first requires schedules/shifts to be persisted to
    Firestore (they are currently in-memory only), so it's a larger follow-up.

### Setup checklist (one-time, to switch it on)

1. **Google Cloud project** (ideally under the Stanford Workspace org): enable
   the **Google Calendar API**.
2. **OAuth consent screen**: set **User type = Internal** (limits it to Stanford
   accounts and avoids public-app verification). Scope needed:
   `https://www.googleapis.com/auth/calendar.events`.
3. **OAuth client** (Application type = *Web application*). Register the redirect
   URI **exactly**: `https://<your-domain>/api/integrations/calendar/google/callback`
   (the Integrations admin screen prints the exact value for the current host).
   Copy the generated Client ID and Client Secret.
4. **Vercel env vars**: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`.
   Optionally `CALENDAR_STATE_SECRET` (a random string; defaults to the client
   secret) and `APP_BASE_URL` (defaults to the request origin).
5. **Firebase Admin credentials** so tokens persist server-side: either
   `FIREBASE_SERVICE_ACCOUNT` (the service-account JSON as a string) or
   `GOOGLE_APPLICATION_CREDENTIALS` (path to the JSON). Production Firebase must
   also be configured (`NEXT_PUBLIC_FIREBASE_*`).
6. **Deploy `firestore.rules`** (adds the locked-down `calendarConnections`
   collection).

When all are present, the Integrations admin card flips to **Ready** and the
per-user **Connect** button in Settings becomes active. Privacy: minimum scope
(`calendar.events` — write only), token revocation on disconnect, no secrets
committed.

## Import / export

- Export schedule as **ICS** and filtered schedules as **CSV** (Reports page
  ships a working client-side fairness CSV export today).
- Import employees, positions, qualifications, availability by **CSV** with a
  downloadable template, validation preview, and row-level error reporting
  (planned; adapter shape defined).

## Notifications

Extensible channel model: in-app (implemented in the local store — schedule
publication notifies assigned employees), email, and Google Calendar update;
SMS later. Supports user preferences, quiet hours, digest vs immediate,
deduplication, delivery status, retry, and a plain-text email fallback. Delivery
runs server-side in production.
