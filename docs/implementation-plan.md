# RCLL Scheduler — Implementation Plan & Status

Phased, independently testable delivery. This build advances well beyond the
Phase 1 foundation: the deterministic scheduling engine, California compliance
engine, fairness analytics, and swap engine (Phases 3 & 5 logic) are implemented
and unit-tested, and the core scheduling/employee workflows (Phase 2) function
end-to-end against a real (in-memory) data store.

## Phase 1 — Secure foundation ✅ (logic) / ⏳ (live Firebase)

- [x] Product constants, approved domains, bootstrap admins
- [x] Domain/invitation/approval access logic + pending screen
- [x] RBAC roles + scopes (`domain/scope.ts`)
- [x] User profiles + admin user management (approve/role/archive)
- [x] Firestore rules + source-level rule test
- [x] Design-token system, light/dark, reduced motion/transparency
- [x] Accessible schedule prototype (now a full workspace)
- [ ] Live Firebase project + App Check + emulator behavioral tests (needs creds)

## Phase 2 — Core scheduling ✅ (local) 

- [x] Locations, operating hours, positions, tasks, qualifications (modeled/seeded/admin views)
- [x] Availability editor (keyboard, no-drag)
- [x] Leave request + manager approval + on-behalf entry
- [x] Schedule editor (board + list), draft → publish workflow, locks
- [x] Employee + manager dashboards
- [x] In-app notifications; fairness CSV export
- [ ] ICS export + CSV import preview (adapters defined)

## Phase 3 — Compliance & flexibility ✅

- [x] California meal/rest policy engine (versioned, configurable)
- [x] Rest/meal planning during generation
- [x] Compliance findings with severity + remediation
- [x] Overrides with recorded reason + audit
- [x] Open shifts + automated shift swaps + manager-review routing
- [x] Fairness metrics (multi-dimensional + Gini)
- [x] Schedule versions (publishedVersion); rollback hooks (version retained)

## Phase 4 — Integrations ⏳

- [x] LibCal hours adapter + normalizer + mock + admin panel
- [x] Google adapter boundary + honest disconnected state + admin screen
- [ ] Live Google free/busy + publish (needs OAuth creds)
- [ ] Scheduled sync monitoring; CSV import UI

## Phase 5 — Intelligent scheduling ✅ (deterministic core)

- [x] Deterministic constraint-solving engine (seeded)
- [x] Day / week / month generation scopes; fill-only & coverage-only modes
- [x] Locked-assignment preservation; unfilled-reason reporting
- [x] Fairness-aware scoring with adjustable weights
- [x] Manager-note → structured-rule interpreter (rule-based; LLM optional)
- [x] Explainable per-assignment + per-schedule output
- [x] Automated weekly draft generation (`generateWeeklyDraft` Cloud Function) —
  runs the deterministic engine on a schedule to seed a manager-reviewed draft
  for the upcoming week; only ever produces a `draft`, preserves locked/published
  and human-authored shifts, is seeded per-week for determinism, and is audited.
  Pure logic in `functions/src/weekly-draft.ts` (server twin of `runGeneration`),
  Firestore I/O in `functions/src/index.ts`.
- [ ] LLM-assisted natural-language query interface (deterministic resolver first)

## Definition of done (per phase)

Workflows function with the data store · authorization enforced server-side
(production) · rules have tests · TypeScript passes with no suppressed errors ·
lint passes · unit/integration tests pass · critical Playwright + axe checks
(planned) · loading/empty/error/disconnected states exist · mobile layouts work ·
docs updated · env vars documented · no secrets committed · no placeholder
actions that pretend to work · runnable locally with documented steps.

## Recommended next phase

1. Stand up a Firebase project; wire the Firestore `Database` adapter behind the
   same `actions.*` functions; move privileged actions into Cloud Functions.
   - [x] `syncUserClaims` Cloud Function (`functions/`) mirrors user
     role/approval state onto Firebase Auth custom claims (idempotent; handles
     demotion/rejection/deletion), plus a one-time `npm run backfill:claims`
     script. See `docs/security-model.md` → *Custom-claims synchronization*.
2. Add `@firebase/rules-unit-testing` emulator tests for the security invariants
   listed in `security-model.md`.
3. Add Playwright + axe E2E for the critical keyboard-only workflows.
4. Implement Google OAuth (free/busy import, one-way publish) and LibCal
   scheduled sync with the existing adapters.
