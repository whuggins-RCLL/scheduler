# Cardinal Shift — Integrations

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
status. Env: `LIBCAL_HOURS_JSON_URL` (defaulted).

## Google Workspace / Calendar

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
