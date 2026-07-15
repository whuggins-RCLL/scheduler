# RCLL Scheduler — Architecture

## Overview

RCLL Scheduler is an AI-assisted workforce scheduling platform for an academic
law library. This document describes the architecture as actually implemented in
this repository.

The product name is held in a single constant (`src/lib/config.ts → PRODUCT_NAME`)
so it can be renamed without touching components.

## Stack

- **Next.js 15 (App Router)** + **React 19**
- **TypeScript strict** (`tsconfig.json`, no suppressed errors)
- **Firebase**: Authentication (Google), Cloud Firestore, Admin SDK (seed script),
  Firestore security rules + emulator config (`firebase.json`)
- **Zod** available for validation of external inputs
- **Vitest** for unit/integration tests

## Layered design

The codebase is deliberately layered so that business logic is pure, testable,
and independent of both Firebase and React.

```
src/
  domain/          Pure, framework-free business logic (no I/O, no Date.now)
    types.ts       Single source of truth for all entity shapes
    time.ts        Minute-of-day math, ISO date helpers, seeded PRNG
    availability.ts Availability resolution (preferred/available/unavailable + leave)
    compliance.ts  California meal/rest + operational compliance engine
    fairness.ts    Multi-dimensional fairness analytics + Gini
    swaps.ts       Shift-swap eligibility gates
    scheduling.ts  Deterministic weighted-scoring constraint solver
    scope.ts       Role + scope authorization checks
    note-interpreter.ts  Rule-based manager-note → structured rule (not an LLM)
  lib/
    config.ts      Product constants, approved domains, bootstrap admins
    authz.ts       Domain/invitation/bootstrap access checks (server-mirrored)
    store/
      types.ts     Database snapshot shape (all collections)
      seed.ts      Deterministic fictional seed data
      actions.ts   Pure workflow functions (Database -> Database) with audit
      StoreProvider.tsx  Client React context binding actions to state
  components/      UI (design system consumers)
  app/             App Router routes
```

### Why a pure domain layer

Every scheduling, compliance, fairness, and swap decision is computed by a pure
function that takes explicit inputs and returns explicit outputs. This means:

- The same functions run in the browser (local/demo), in Cloud Functions
  (production, server-enforced), and in tests — with identical behavior.
- Nothing in `domain/` calls `Date.now()`, `Math.random()` (except the seeded
  PRNG), the network, or Firestore. Timestamps and seeds are passed in.
- The scheduling engine is **deterministic**: identical inputs + seed always
  produce an identical schedule (proven in `tests/scheduling.test.ts`).

## Data flow

### Local / demo mode (this build)

`StoreProvider` seeds an in-memory `Database` (`buildSeed()`) and holds it in
React state. UI actions call the pure `actions.*` functions, which return a new
`Database` snapshot; the provider commits it with `setState`. This makes every
workflow — availability, leave, generation, publication, swaps, user management
— function end-to-end **without live Firebase credentials**, while using the
exact code paths intended for production.

### Production (documented adapter boundary)

The same `actions.*` functions run inside Firebase Cloud Functions against a
Firestore-backed `Database` adapter. Privileged operations (role changes,
invitation issuance, schedule publication, engine execution, compliance
validation, sync, audit logging) are enforced **server-side**; the browser is
never trusted for authorization or compliance decisions. Firestore security
rules (`firestore.rules`) are the first server-enforced boundary.

The `functions/` codebase holds the deployed Cloud Functions. The first is
`syncUserClaims`, an `onDocumentWritten` trigger on the `users` collection that
mirrors each account's role/approval state onto its Firebase Auth custom claims
(what the rules enforce). Its reconciliation core (`functions/src/claims.ts`) is
pure and unit-tested; see `docs/security-model.md` → *Custom-claims
synchronization*.

## Authorization model

Two tiers, matching the spec:

1. **Firebase custom claims** (`roles`, `orgId`) for coarse, high-level checks —
   used by Firestore rules and middleware.
2. **Firestore permission records / `RoleGrant[]`** with optional `RoleScope`
   (location/department/team) for configurable, fine-grained scope. `scope.ts`
   implements `canViewEmployee`, `visibleEmployees`, `canManage`, etc.

Route protection is enforced both client-side (`middleware.ts`, cookies) and,
in production, server-side in Cloud Functions and rules.

## Key architecture decisions

- **Time as integer minutes-of-day.** All clock math is timezone-free integer
  arithmetic; dates are ISO strings. This removes an entire class of DST/tz bugs
  from the compliance and scheduling engines.
- **Deterministic engine, LLM only for interpretation.** The scheduler is a
  weighted greedy constraint solver with seeded tie-breaking. An LLM is never
  the optimizer; it is limited to interpreting prose into *proposed* structured
  rules (which a manager must confirm) and explaining results.
- **Immutable action functions.** `actions.*` deep-clone and return new
  snapshots, so React re-renders correctly and every mutation is auditable.
- **Archive, never delete.** No action deletes historical scheduling records;
  users and shifts are archived/cancelled and referential integrity is kept.

## Testing

- `tests/` covers time math, availability, the compliance engine, fairness/Gini,
  swap eligibility, scheduling determinism, note interpretation, scope
  visibility, and full end-to-end store workflows.
- Firestore rules have a source-level assertion test; full emulator tests require
  the Firebase CLI (documented in `docs/security-model.md`).

## Running locally

```
npm install
npm test           # 50+ unit/integration tests
npm run dev        # app on http://localhost:3000 (in-memory demo data)
```

See `README`/`docs/implementation-plan.md` for phase status and environment
variables.
