# RCLL Scheduler — Data Model

All entity shapes live in `src/domain/types.ts`. The tenant snapshot
(`src/lib/store/types.ts → Database`) holds every collection as an array; in
production each maps to a Firestore collection under
`organizations/{orgId}/...`.

## Conventions

- **Dates** are ISO calendar days (`"YYYY-MM-DD"`).
- **Times of day** are integer minutes-from-midnight (`0..1439`).
- **Timestamps** for records/audit are full ISO strings, supplied by the caller.
- Emails are normalized to lowercase before comparison.

## Collections

| Collection | Purpose | Key fields |
|---|---|---|
| `users` | Auth account + roles | id, email, displayName, state, roles[] (RoleGrant) |
| `employees` | Employment profile | classification, managers, locations, hour limits, qualifications, %FTE, break policy |
| `departments` / `teams` | Org units | id, name, (team→departmentId) |
| `locations` | Service points | timeZone, minStaffing, buffers, libcalId |
| `operatingHours` | Weekly hours + exceptions | weekly[weekday]→intervals, exceptions[] |
| `positions` | Where/how someone is scheduled | staffing min/pref/max, public-service, swap/self-claim flags, color/icon |
| `tasks` | Discrete duties | category, duration, checklist, opening/closing dependency |
| `availability` | Recurring availability patterns | blocks[] (weekday, start, end, kind), effective dates, audit attribution |
| `leaveTypes` | Configurable leave/exception types | paid, approvalRequired, blocksScheduling, visibility |
| `leave` | Leave records | type, dates, status, enteredBy/decidedBy (audit), note |
| `schedules` | Schedule versions | startDate, endDate, status, version, publishedVersion |
| `shifts` | Assignments | employee|null, position, location, date, start/end, breaks[], taskIds[], status, source, locked, scheduleVersion |
| `coverage` | Coverage requirements the engine fills | date, position, location, window, count |
| `swaps` | Swap requests | kind, shift, from/to, status, immutable history[] |
| `notes` | Structured manager notes | type, scope, visibility, usableByEngine, ruleClass, structuredRule? |
| `breakPolicies` | Versioned compliance policy | meal/rest/overtime/turnaround thresholds, version |
| `overrides` | Compliance overrides | findingRuleId, employee, date, reason, actor |
| `invitations` | Signed, expiring, single-use invites | email, token, role, expiresAt, revoked |
| `notifications` | In-app notifications | userId, type, title, body, read |
| `audit` | Append-only audit trail | actor, action, target, before/after, reason, source, createdAt |

## Account states

`invited → pending_approval → active`, plus `temporarily_inactive`,
`archived`, `access_revoked`. Departing staff are **archived**, never deleted;
shifts are **cancelled**, never deleted — preserving referential integrity and
history.

## Shift status & source

Status: draft, proposed, published, acknowledged, in_progress, completed,
cancelled, open, swap_pending, coverage_needed.
Source: ai_generated, template_generated, manager_created, employee_claimed,
shift_swap, imported.

## Indexes (Firestore)

Defined in `firestore.indexes.json`: `shifts` by `(employeeId, startAt)` and
`auditEvents` by `(actorId, createdAt desc)`. Additional composite indexes for
schedule-by-date and coverage-by-position queries are added as those server
queries are introduced.

## Transaction boundaries

Multi-record operations — **schedule publication**, **shift swaps**, role
changes — run as Firestore transactions / atomic batches in production so a
partial write can never leave the schedule inconsistent. In the local store the
equivalent `actions.*` function performs the whole change on one snapshot
atomically.

## Tenant boundary

Everything is scoped to one organization (`ORGANIZATION_ID`). Firestore paths
are `organizations/{orgId}/{collection}/{doc}` and rules verify the caller's
`orgId` claim, keeping the model multi-tenant-ready.
