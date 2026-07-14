# Cardinal Shift integrations

## Repository audit

- Repository began as an empty Git worktree with only `.gitkeep`.
- Framework selected: Next.js App Router with React and strict TypeScript.
- Package versions are resolved from `package.json` using current npm ranges for Next.js, React, Firebase, Firebase Admin, Zod, Vitest, and Firebase rules testing.
- Current routes include `/login`, `/pending`, `/dashboard`, `/schedule` variants, employee workflow shells, and `/admin` sections required for Phase 1.
- Authentication state: Firebase client Google Sign-In is implemented; server-side custom claims and account approval are represented in rules, middleware, and seed script but require a Firebase project.
- Firebase configuration: client env vars are documented in `.env.example`; Firestore rules, indexes, hosting, and emulator config are present.
- Existing env vars: none were present before this implementation; required variables are listed in `.env.example`.
- Testing setup: Vitest unit tests and source-level Firestore rules checks are included; full emulator tests require Firebase CLI/project setup.
- Deployment setup: Firebase Hosting framework config is documented in `firebase.json`.
- Design system: CSS design tokens define Cardinal-inspired light/dark themes, semantic statuses, focus, reduced motion, and reduced transparency.

## Phase 1 scope

This document is part of the first deliverable: secure foundation, planning, Firebase auth shell, route protection, administrator seed path, admin/user shells, employee dashboard shell, security rules, and accessible schedule grid prototype.

## Later phases

Phase 2 core scheduling; Phase 3 compliance and swaps; Phase 4 integrations; Phase 5 deterministic scheduling and AI-assisted interpretation.

## Required credentials

Firebase web config, Firebase Admin credentials, Google Calendar OAuth consent/client configuration, LibCal API/feed access, email delivery provider credentials, and optional AI provider credentials remain required. No secrets are committed.

## LibCal hours feed

The provided LibCal JSON-LD widget URL is now represented as `LIBCAL_HOURS_JSON_URL` with a safe default for library ID `2457`. The server route `/api/integrations/libcal/hours` uses `LibCalHoursProvider` to fetch JSON or JSONP, normalize dated `OpeningHoursSpecification` records, and return warnings when the feed cannot be parsed or reached.

The current implementation intentionally does not write LibCal data into Firestore yet. Phase 2 should cache normalized intervals under the operational-hours collections, preserve manager-created exceptions, and display source discrepancies before any authoritative sync.
