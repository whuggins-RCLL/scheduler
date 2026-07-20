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
- **Bootstrap-admin break-glass.** The five bootstrap administrators are trusted
  by **verified email** — both in `firestore.rules` (`isBootstrapAdmin()`, which
  makes `isAdmin()` true for them) and in the app (`ensureUserAccount` creates or
  repairs their document to active `SUPER_ADMIN` on sign-in). This guarantees
  they can never be locked out even if `npm run seed` never ran, targeted the
  wrong project, or left their document role-less, and it breaks the
  chicken-and-egg where setting an admin's claim requires an admin. The email
  list in the rules must stay in sync with `BOOTSTRAP_ADMINS` in
  `src/lib/config.ts` (a test asserts every configured email is present).

## Authorization

Two tiers:

1. **Firebase custom claims** (`roles`, `orgId`) — coarse checks used by
   `firestore.rules` and `middleware.ts`.
2. **`RoleGrant[]` with optional `RoleScope`** (location/department/team) —
   fine-grained, configurable scope enforced by `src/domain/scope.ts`
   (`canViewEmployee`, `visibleEmployees`, `canManage`, `canPublishSchedule`,
   `canOverrideCompliance`, `canEditRoles`).

Roles: `SUPER_ADMIN`, `MANAGER`, `SCHEDULER`, `LIBRARY_STAFF`, `VIEWER`, `AUDITOR`.
A person may hold multiple roles, and a role may apply only to a unit.

## Server-side enforcement

The browser is never trusted for role, authorization, or compliance decisions.
In production these run in Cloud Functions with the Admin SDK: role changes,
invitation issuance, schedule publication, engine execution, compliance
validation, Google/LibCal sync, notification delivery, and audit logging. The
pure `actions.*` functions are the shared implementation.

## Firestore rules (`firestore.rules`)

Data is tenant-scoped under `/organizations/{orgId}/<collection>/{id}`; the rule
header documents the store-key → collection-name mapping.

- Default deny (`match /{document=**} { allow read, write: if false; }`) — every
  collection is allowed explicitly or refused.
- Users/profiles: readable by admins, in-scope managers, or self. On first
  Google sign-in a person may **self-register their own account only**, and only
  as `pending_approval` with no roles (so admins can see and act on them);
  approval, role assignment, and suspension are **admin-only** (`allow update: if
  isAdmin()`). Profiles are mutable by admins+managers. **Never deletable**.
  Custom claims (`roles`) enforced by rules are kept in sync with the user
  document by the `syncUserClaims` Cloud Function (see **Custom-claims
  synchronization** below): an in-app role/approval change updates the document,
  and the trigger mirrors it onto the `roles` claim so rule-level enforcement of
  the other collections follows automatically.
- Availability patterns & exceptions (`leaveRecords`): readable by admin/manager
  or the owning employee only; the owner may create/update their own, and
  admins/managers may record or update them on an employee's behalf (call-outs).
  **Never deletable** — superseded, not removed. There is no approval queue.
- Manager notes: admin/manager only (employees cannot read private notes).
- Daily notes (dashboard feed): any signed-in user may read a **published** note;
  managers create their own drafts (`published == false`); **only admins may flip
  `published`** (publish/unpublish); an author or admin may delete.
- Schedules/shifts: readable by signed-in users; writable by admin/manager;
  never deletable. Coverage requirements are manager-writable planning data.
- Swap requests: readable by admin/manager or a participant; created by any
  signed-in user; decisions (updates) are manager-gated.
- Configuration: readable by any signed-in user. Operational config
  (positions, tasks, operating hours) is admin/manager-writable; structural
  reference data (locations, departments, teams, leave types, break policies) is
  admin-only. None is deletable (archive via `active`).
- Notifications: readable by the owner (or admin); an owner may only mark their
  own read; created by trusted server code on publish.
- Compliance overrides: admin/manager only.
- Audit events: readable by admin/auditor; **client writes forbidden** (written
  only by trusted server code).

### Emulator tests (planned, documented)

`npm run test:rules` currently asserts the rules source enforces the key
invariants. Full behavioral emulator tests (via `@firebase/rules-unit-testing`
against `firebase emulators:exec`) should prove that a LIBRARY_STAFF account cannot: promote
themselves, read private manager notes, read others' confidential exceptions,
publish/unpublish a daily note, modify published schedules, assign themselves
unqualified work, override compliance, or access unauthorized departments. These
require the Firebase CLI in the environment; the rule structure above already
encodes each invariant, and `tests/firestore-rules.test.ts` asserts the
source-level invariants in the meantime.

## Custom-claims synchronization

Firestore rules gate the *database layer* on Firebase Auth **custom claims**
(`request.auth.token.roles`), while the application UI gates on the user
**document**. The `syncUserClaims` Cloud Function
(`functions/src/index.ts`) keeps the two in lockstep so a role or approval
change made in the app takes effect at the rules layer too.

- **Trigger:** `onDocumentWritten` on
  `organizations/{orgId}/users/{userId}` — one trigger covers create, approval,
  role change, suspension, rejection, and document deletion.
- **Rule:** the `roles` claim is present only while `state === "active"`; every
  other state (invited, pending, `temporarily_inactive`, archived,
  `access_revoked`) and a deleted document **removes** it. `orgId` is set as a
  tenant tag and never stripped. All unrelated claims are preserved.
- **Idempotent:** the desired claims are compared (order-insensitively on
  `roles`) with the account's current claims and written only when they differ,
  so replays and the backfill never churn.
- **Prompt effect:** on any change the function also calls
  `revokeRefreshTokens`, forcing existing sessions to pick up the new claims on
  their next refresh rather than after the ~1h token lifetime — important for
  demotion and revocation.
- **Workforce profile lifecycle:** the same trigger creates a safe
  `employeeProfiles/{uid}` draft when an active account receives a staff role,
  including for administrators who also work shifts. Removing access or the
  staff role deactivates the profile without deleting historical records.
- **Reconciliation logic** lives in the dependency-free `functions/src/claims.ts`
  and is unit-tested by `tests/claims.test.ts` (approval, demotion, rejection,
  suspension, deletion, claim preservation, idempotency).
- **Backfill:** `npm run backfill:claims` applies the same logic once across all
  existing user documents, for accounts approved before the trigger was
  deployed. See `README` → *Custom-claims synchronization*.

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
