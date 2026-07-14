# RCLL Scheduler — Security Model

## Authentication

- Google Sign-In via Firebase Authentication (`src/lib/firebase.ts`).
- Access is restricted to the approved domains `stanford.edu` and
  `law.stanford.edu`. The `hd` OAuth hint is only a UX nicety; **domain
  validation is enforced server-side** after authentication (`lib/authz.ts`
  mirrors the check that Cloud Functions/rules apply). Client-side string checks
  are never the sole gate.
- A user must additionally satisfy one of: a valid unexpired invitation, prior
  administrator approval, or membership in the seeded bootstrap admins.
  Authenticated-but-unapproved users see `/pending`.

## Authorization

Two tiers:

1. **Firebase custom claims** (`roles`, `orgId`) — coarse checks used by
   `firestore.rules` and `middleware.ts`.
2. **`RoleGrant[]` with optional `RoleScope`** (location/department/team) —
   fine-grained, configurable scope enforced by `src/domain/scope.ts`
   (`canViewEmployee`, `visibleEmployees`, `canManage`, `canPublishSchedule`,
   `canOverrideCompliance`, `canEditRoles`).

Roles: `SUPER_ADMIN`, `MANAGER`, `SCHEDULER`, `EMPLOYEE`, `VIEWER`, `AUDITOR`.
A person may hold multiple roles, and a role may apply only to a unit.

## Server-side enforcement

The browser is never trusted for role, authorization, or compliance decisions.
In production these run in Cloud Functions with the Admin SDK: role changes,
invitation issuance, schedule publication, engine execution, compliance
validation, Google/LibCal sync, notification delivery, and audit logging. The
pure `actions.*` functions are the shared implementation.

## Firestore rules (`firestore.rules`)

- Default deny (`match /{document=**} { allow read, write: if false; }`).
- Users/profiles: readable by admins, in-scope managers, or self; mutable only
  by admins (users) / admins+managers (profiles); **never deletable**.
- Manager notes: admin/manager only (employees cannot read private notes).
- Leave: readable by admin/manager or the owning employee only (confidential
  reasons are not exposed to coworkers).
- Schedules/shifts: readable by signed-in users; writable by admin/manager;
  never deletable.
- Compliance overrides: admin/manager only.
- Audit events: readable by admin/auditor; **client writes forbidden** (written
  only by trusted server code).

### Emulator tests (planned, documented)

`npm run test:rules` currently asserts the rules source enforces the key
invariants. Full behavioral emulator tests (via `@firebase/rules-unit-testing`
against `firebase emulators:exec`) should prove that an EMPLOYEE cannot: promote
themselves, read private manager notes, read others' confidential leave, modify
published schedules, assign themselves unqualified work, override compliance, or
access unauthorized departments. These require the Firebase CLI in the
environment; the rule structure above already encodes each invariant.

## Other requirements

- Firebase App Check to be enabled in production.
- OAuth uses minimum necessary scopes; by default managers see only busy/free
  blocks, never private event titles.
- Secrets are never committed. `.env.example` lists variables only.
- Sensitive functions are rate-limited; inputs validated (Zod); mass-assignment
  prevented by whitelisting fields in `actions.*`.
- Audit logging never records tokens or confidential leave detail.
- Sessions can be revoked (account state `access_revoked`).

## Privacy & responsible AI

- Collect only necessary data; distinguish public team info from manager-only
  info; team schedule views show only "Out"/"Unavailable", not leave reasons.
- No employee data is sent to an external AI provider without minimization;
  demographic attributes are never used to optimize schedules.
- AI output is advisory: the LLM cannot grant permissions, change roles, approve
  legal overrides, or publish. A manager must review generated schedules before
  publication, and AI features can be disabled while deterministic scheduling
  continues (`AI_FEATURES_ENABLED`).
