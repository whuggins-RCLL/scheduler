# Scope: Server-backed scheduling (persist schedules & shifts to Firestore)

**Status:** proposal / scoping — no code yet.
**Prompted by:** PR #67 (push-published-shifts-on-publish), which had to be a
client-initiated push because schedules/shifts aren't persisted server-side. A
fully server-side push (a Firestore-triggered Cloud Function) requires this work
first. This doc scopes that prerequisite and what it unlocks.

---

## 1. Why

Scheduling data — **schedules, shifts, coverage requirements, swap requests** —
currently lives only in the browser's in-memory store. That blocks three things:

- **Durability & multi-device.** A published schedule is never saved
  server-side, so in production a refresh or a different device loses it. (Only
  accounts, profiles, availability, working hours, and config persist today.)
- **Server-side automation.** Anything that must run without a manager's browser
  open — most immediately the **reliable push-on-publish to every assignee's
  Google Calendar**, and the already-written **weekly auto-draft** function.
- **A single source of truth.** Managers and staff on different devices can see
  different schedules.

Persisting schedules + shifts is the prerequisite that unlocks all of it.

---

## 2. Current state (as found in the code)

The in-memory `Database` (`src/lib/store/types.ts`) has **25 collections**. Only
**9 are persisted to Firestore** today, each via the same pattern
(`map*` / `subscribe*` / `write*` / `bootstrap*` in a `firestore-*.ts` module,
wired into `StoreProvider` on auth):

> users · employeeProfiles · availabilityPatterns · workingHoursPatterns ·
> departments · locations · positions · tasks · globalExceptions

The other **16 are in-memory only** — including the scheduling core:

> **schedules · shifts · coverage · swaps** · leave · leaveTypes · breakPolicies ·
> notes · dailyNotes · overrides · notifications · audit · invitations · teams ·
> operatingHours · studentAvailabilityWindows

### What already exists (this shrinks the work substantially)

- **Security rules are already written** for schedules, shifts,
  coverageRequirements, swapRequests, complianceOverrides, leaveRecords,
  managerNotes, dailyNotes, leaveTypes, notifications, and auditEvents
  (`firestore.rules`). The access model is done, not greenfield.
- **A server-side draft generator already reads and writes shifts.**
  `generateWeeklyDraft` (`functions/src/index.ts`, an `onSchedule` function)
  reads 11 collections from Firestore and **reads + writes the `shifts`
  collection** — scoped `where scheduleId ==`, committed in ≤450-op batches, and
  it already respects locked / published / human-authored shifts. So the
  Firestore shift schema and the bulk-write batching are already implemented
  server-side.
- **A proven client persistence pattern** to copy for the new collections
  (optimistic in-memory `setDb` + fire-and-forget `write*`; `onSnapshot`
  subscriptions that can be self-scoped for non-managers; "keep the in-memory
  seed until Firestore is populated").

### The gap

The **client** never reads or writes schedules/shifts/coverage/swaps — there is
no `firestore-schedules`/`firestore-shifts` module, no `subscribeShifts`, and
`publishSchedule` only mutates memory. Consequences:

1. Scheduling data is ephemeral in production.
2. `generateWeeklyDraft` is effectively **inert** — it reads collections
   (shifts, coverage, leave, breakPolicies, notes, …) that nothing populates, so
   it runs on near-empty inputs.

Closing that loop is the project.

---

## 3. Scope of work (phased)

### Phase 1 — Persist schedules + shifts *(the targeted unlock)*

1. **New modules** `firestore-schedules.ts`, `firestore-shifts.ts`:
   `mapSchedule`/`mapShift`, `subscribeSchedules`/`subscribeShifts` (scoped — see
   Decision 2), `writeSchedule`/`writeShift`, `writeShiftsBatch` (bulk),
   `deleteShift`.
2. **Wire subscriptions** into `StoreProvider` on auth, replacing the seed once
   Firestore has data (reuse the existing "keep seed until populated" trick).
3. **Persist on mutation** — the ~16 actions that touch schedules/shifts
   (`runGeneration` [bulk-creates], `publishSchedule`, `upsertShift`,
   `cancelShift`, `toggleLock`, the swap/coverage actions, `purgeOldSchedules`
   [deletes], `setScheduleTypeAccess`, …). Via per-action writes *or* centralized
   diff-sync (Decision 1).
4. **Migration** — a `backfill:schedules` script (matches the existing
   `backfill:*` scripts) to seed the current sample schedule for a tenant.
5. **Deploy** the already-written rules; exercise them in the emulator.
6. **Then** replace PR #67's client push with a true
   `onDocumentWritten('.../schedules/{id}')` Function: on status → `published`,
   read the schedule's shifts + each assignee's calendar token and push
   server-side, **reusing `planPublishedScheduleSync` from #67**. Reliable,
   retried, and independent of whether the manager's tab is open.

### Phase 2 — Persist the rest of the scheduling loop

coverage · swaps · leave · leaveTypes · breakPolicies · notes — so the weekly
auto-draft and swap workflows work end-to-end server-side (the draft function
already reads these; they're simply empty today).

### Phase 3 — Operational records

notifications (durable, cross-device) · audit (real append-only log) ·
dailyNotes · overrides. Mostly mechanical, following the same pattern.

---

## 4. Key design decisions (need a call before Phase 1)

1. **Write strategy — per-action vs diff-sync.** Per-action `write*` matches
   today's pattern but means threading writes through ~16 sites, several of which
   mutate *many* shifts at once. A **centralized diff-sync** (after each `setDb`,
   diff the schedules/shifts slices and write changed/deleted docs in one place,
   batched) is less error-prone for high-churn, bulk-mutated collections.
   **Recommendation: diff-sync for shifts.** Tradeoff: it's a new pattern and
   needs careful diffing + the ≤450-op batching (helper already exists in
   `functions/src/index.ts`).
2. **Read scoping / scale.** Shifts are the highest-volume collection (potentially
   hundreds per schedule). Scope subscriptions to the active schedule(s) and/or a
   date window instead of the whole collection; non-managers can be self-scoped.
   (Rules currently allow `read: signedIn` on shifts — coarse but acceptable;
   scope the *query* for cost/perf, not just permissions.)
3. **Concurrency / source of truth.** Optimistic in-memory + async write, with
   last-write-wins via `serverTimestamp`. The `generateWeeklyDraft` function and
   the client must not clobber each other — the function already skips
   locked/published/human shifts; preserve that invariant.
4. **Cost & bulk ops.** Generation writes many shifts — use batched writes and
   watch `onSnapshot` read costs. Mirror the existing `purgeOldSchedules` action
   server-side so old data is archived, not accumulated.
5. **Testing.** Exercise the rules and the publish trigger against
   `firebase emulators:exec` (the security-model doc already calls for this).

---

## 5. Payoff

Once **Phase 1** lands, the "fully server-side push-on-publish" is a *small*
Function — the hard parts (planner, Google provider, token store) already exist
from #65/#67. It fires the instant a schedule doc flips to `published`,
regardless of the manager's browser, and gets Cloud Functions' automatic retries.
It supersedes the client-initiated push in #67 (which can remain as a fallback).

Phases 2–3 additionally make the **weekly auto-draft** actually work and give
**durable notifications and a real audit trail**.

---

## 6. Risks / gotchas

- **High mutation surface** (~16 actions, some bulk) → favors diff-sync.
- **Enabling persistence "activates" the currently-inert `generateWeeklyDraft`
  scheduled function.** Make sure that's intentional and its inputs (Phase 2
  collections) exist, or gate/disable it until Phase 2.
- **Dual source of truth during rollout** — migrate the seed carefully; decide
  whether Firestore or memory wins on first load per tenant.
- **Firestore cost** — shifts are the largest, most-written collection; scope
  reads and archive aggressively.

---

## 7. Rough effort

| Phase | Content | Size |
|------|---------|------|
| 1 | schedules + shifts persistence, client wiring, publish trigger, tests, emulator | **M** (the meat — a few days) |
| 2 | coverage, swaps, leave, leaveTypes, breakPolicies, notes | **M** (mechanical, following the pattern) |
| 3 | notifications, audit, dailyNotes, overrides | **S–M** |

---

## 8. Recommendation

Do **Phase 1 as its own PR** — it's the minimum that makes schedules durable
*and* unlocks the reliable server-side calendar push. Defer Phases 2–3 unless the
weekly auto-draft and durable notifications/audit are also wanted now. **Settle
Decision 1 (write strategy) first**, since it shapes the whole of Phase 1.
