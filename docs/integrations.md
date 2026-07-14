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

## Google Workspace / Calendar (staff OAuth)

Status: **adapter + mock**; live OAuth requires credentials (not configured in
this environment). Planned model, simplest-first:

1. One-way **publish** of assigned shifts to a personal/selected calendar
   (event carries position, location, times, tasks, break info, schedule link,
   version, and human-readable change info).
2. **Free/busy import** into scheduling as a *constraint* (never auto-equated to
   leave — employees/managers classify or override it).
3. Optional two-way sync only after the one-way model is reliable.
4. **ICS** subscription/export as a fallback.

Privacy: minimum OAuth scopes; managers see busy/free only, not private event
titles; token revocation handled; incremental sync where supported.
Env: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`.

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
