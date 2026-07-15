# RCLL Scheduler

AI-assisted workforce scheduling and operations platform for an academic law
library. Built with Next.js (App Router), React, TypeScript (strict), and
Firebase. The product name lives in one constant (`src/lib/config.ts`).

> RCLL Scheduler is an original system inspired by modern scheduling tools. It
> is not an officially approved Stanford product.

## What's implemented

- **Deterministic scheduling engine** — weighted constraint solver; same
  inputs + seed ⇒ same schedule; explainable assignments and unfilled reasons.
- **California meal/rest compliance engine** — versioned, configurable policy;
  validates whole workdays; hard/overrideable/warning/info findings; overrides
  with audit.
- **Fairness analytics** — multi-dimensional load + normalized fair share
  (by availability & %FTE) + Gini.
- **Shift swaps** — auto-approve when every policy gate passes, else manager
  review; open-shift marketplace.
- **Sign in / sign out** — real session with a `/login` screen. Google sign-in
  activates once Firebase is configured; until then, sign in as an existing
  account. No example/staff users are shipped — only the five real
  administrators plus configuration.
- **Availability & Exceptions (one place)** — the keyboard, no-drag availability
  editor and availability-exception entry live together on one page. The
  platform tracks only availability exceptions (no paid-leave categories or
  approval queues): staff mark when they are unavailable, and managers can enter
  or update an employee's exceptions on their behalf when someone calls out. All
  entries are audited.
- **Dashboard** — glass-effect welcome layout with a rolling daily-notes feed
  (managers post with a visibility window; admins publish/unpublish), embedded
  operating hours, and a link to Stanford's time-keeping system. Admins can load
  a sample schedule and "view as" a student or staff member to sample those
  experiences.
- **Positions & Tasks are admin-managed** — created, edited, and archived from
  the admin portal (not hard-coded).
- **Schedule workspace** (board + list, draft/publish, locks), **dashboards**,
  **admin portal**, **audit trail**.
- **Integrations** — LibCal hours adapter (+ mock + normalizer) with the **+2h
  desk-coverage rule**, the shared **Google operations calendar** (public embed
  + secret iCal import), and a Google Workspace OAuth boundary with honest
  disconnected state.

Business logic lives in `src/domain/` as pure, tested functions and runs
identically in the browser, in tests, and (in production) in Cloud Functions.

## Local setup

```bash
npm install          # install dependencies
npm test             # run the unit/integration suite (50+ tests)
npm run dev          # start the app at http://localhost:3000
npx tsc --noEmit     # type-check (strict, no suppressed errors)
```

The dev server runs in **local mode**: the tenant is an in-memory dataset
containing only the five real administrators plus baseline configuration
(`src/lib/store/seed.ts`) — no example staff. Every workflow functions
end-to-end **without live Firebase credentials**. At `/login`, sign in as one of
the seeded administrators (Google sign-in activates once Firebase env vars are
set). Positions, tasks, and staff are added from the admin portal. Theme and
reduce-transparency controls live in the top bar.

> Test fixtures with rich sample data live in `tests/fixtures.ts` (used by the
> engine/workflow tests) and are never shipped in the application seed.

## Environment variables

Copy `.env.example` and fill in when connecting live services (never commit real
values):

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` … `_APP_ID` | Firebase web app config (client auth) |
| `GOOGLE_APPLICATION_CREDENTIALS` | Admin SDK service account for the seed script |
| `LIBCAL_HOURS_JSON_URL` | LibCal hours JSON-LD feed (has a default) |
| `GOOGLE_CALENDAR_ICAL_URL` | **Secret** iCal feed for the ops calendar — set in Vercel, never commit |
| `GOOGLE_OAUTH_CLIENT_ID` / `_SECRET` | Google Workspace staff-calendar OAuth (planned) |

## Seeding bootstrap administrators (production)

With a Firebase project + service account configured:

```bash
npm run seed          # idempotently seeds the five SUPER_ADMIN accounts
```

### Backfilling users who signed in before self-registration existed

People who authenticated with Google before the app wrote user documents have a
Firebase Auth account but no Firestore `users/{uid}` document, so they don't
appear in **Admin → Users** for approval. New sign-ins self-register from now on;
run this one-time, idempotent catch-up for the earlier ones (approved-domain
users become `pending_approval`; bootstrap admins become active `SUPER_ADMIN`):

```bash
# Authenticate the Admin SDK once (either works):
gcloud auth application-default login
#   ...or: export GOOGLE_APPLICATION_CREDENTIALS=./service-account.json
npm run backfill:users
```

## Custom-claims synchronization (production)

Firestore rules enforce permissions from Firebase Auth **custom claims**, while
the app reads the user **document**. The `syncUserClaims` Cloud Function
(`functions/`) mirrors each user's `roles`/approval state onto their claims
whenever the document changes — so approving a user or changing their role in
the admin portal takes effect at the database layer automatically. It handles
promotion, demotion, suspension, rejection, and deletion; is idempotent; and
preserves unrelated claims. See `docs/security-model.md` → *Custom-claims
synchronization*.

```bash
# Install + type-check the functions codebase
npm --prefix functions install
npm --prefix functions run build          # compiles functions/src → functions/lib

# Deploy ONLY the trigger (and rules) — requires the Firebase CLI + login
firebase deploy --only functions:syncUserClaims
firebase deploy --only firestore:rules    # if rules changed

# One-time backfill for users approved before the trigger existed (idempotent).
# Uses the same reconciliation logic as the trigger.
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json npm run backfill:claims
```

> Local emulation: `npm --prefix functions run serve` runs the function against
> the Auth + Firestore emulators configured in `firebase.json`.

## Documentation

- `docs/product-requirements.md` — scope and capability status
- `docs/architecture.md` — layers, data flow, decisions
- `docs/data-model.md` — collections, conventions, transactions
- `docs/security-model.md` — auth, RBAC, rules, privacy, responsible AI
- `docs/scheduling-engine.md` — solver, compliance, fairness, note interpretation
- `docs/accessibility.md` — WCAG 2.2 AA approach and test plan
- `docs/integrations.md` — LibCal, Google, import/export, notifications
- `docs/implementation-plan.md` — phased status and next steps

## Known limitations

- Live Firebase, Google OAuth, and LibCal live sync require credentials not
  present in this environment; adapters, mocks, admin screens, and disconnected
  states are implemented and documented.
- Firestore security rules ship with a source-level test; full behavioral
  emulator tests and Playwright/axe E2E are the recommended next step.
