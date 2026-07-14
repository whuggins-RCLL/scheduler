# Cardinal Shift — Product Requirements

## Mission

A production-quality, responsive workforce scheduling and operations platform
for an academic law library, combining workforce scheduling, service-point
coverage, task assignment, availability, leave, California meal/rest compliance,
shift swaps and open-shift pickup, AI-assisted (but human-reviewed, deterministic)
schedule generation, manager notes, Google Workspace and LibCal integration,
fairness analytics, role-based administration, and a complete audit history.

The experience aims to feel premium, calm, trustworthy, and exceptionally easy
to understand. Cardinal Shift is an original system inspired by — not a clone of
— existing scheduling tools, and is not represented as an official Stanford
product.

## Personas & roles

- **Super admin** — full system + configuration + integrations + audit.
- **Manager** — scheduling, publication, leave decisions, notes, compliance
  review, fairness reports, within assigned scope.
- **Scheduler** — build/generate/repair schedules within departments.
- **Employee** — availability, leave, view schedules, swaps, open-shift pickup,
  tasks, calendar connection, notification preferences.
- **Viewer/Auditor** — read-only access to permitted schedules/reports/audit.

Roles support scope by location, department, team, employment group, and
reporting relationship; a person may hold several.

## Core capabilities (status in this build)

| Capability | Status |
|---|---|
| Domain-restricted Google auth + invitation + pending approval | Auth + logic built; live OAuth needs credentials |
| Bootstrap admins seeded idempotently | Built (`scripts/seed.ts`, `config.ts`) |
| RBAC with scope | Built (`domain/scope.ts`) |
| Locations, operating hours, positions, tasks, qualifications | Modeled + seeded + admin views |
| Availability editor (no-drag, keyboard) | Built |
| Leave request + manager approval + on-behalf entry | Built |
| Schedule editor (board + list), draft/publish, versions, locks | Built |
| California meal/rest compliance engine + overrides | Built + tested |
| Fairness analytics (multi-dimensional + Gini) | Built + tested |
| Shift swaps (auto-approve vs manager review) + open shifts | Built + tested |
| Deterministic AI-assisted generation + explanations | Built + tested |
| Manager notes → structured rules (rule-based interpreter) | Built + tested |
| Notifications (in-app) | Built (in-app); email/calendar planned |
| Audit trail (append-only) | Built |
| Admin portal (users, positions, tasks, compliance, integrations, audit, …) | Built |
| Google Calendar / LibCal integration | Adapters + mocks + admin screens |
| CSV/ICS export & import | Fairness CSV live; ICS/import adapters defined |

## Non-negotiables honored

- Server-side domain validation and authorization (browser never trusted).
- Archive/cancel, never delete historical records.
- Compliance rules are versioned, configurable data — not scattered in UI.
- Fairness normalizes by availability & %FTE and is never a bare number.
- AI never authorizes, changes roles, approves overrides, or publishes;
  managers review before publication; AI can be disabled.
- No secrets committed; adapters + mocks + graceful states for un-credentialed
  integrations.
- Accessibility: WCAG 2.2 AA targets, keyboard-first, color never the only
  signal, list/table alternatives to grids.

## Out of scope for now

Emergency-contact collection, SMS notifications, partial-shift-split swaps,
and two-way calendar sync are deferred to later phases (see
`implementation-plan.md`).
