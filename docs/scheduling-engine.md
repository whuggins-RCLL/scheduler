# Cardinal Shift — Scheduling & Compliance Engine

Implemented in `src/domain/scheduling.ts`, `src/domain/compliance.ts`,
`src/domain/fairness.ts`, and `src/domain/note-interpreter.ts`.

## Design principles

- **Deterministic.** Same inputs + `seed` ⇒ identical schedule. Tie-breaks use a
  seeded PRNG (`mulberry32`) blended with a stable per-employee hash, so equal
  scores rotate fairly but reproducibly. Verified in `tests/scheduling.test.ts`.
- **Explainable.** Every assignment records why the candidate won; every
  unfilled requirement records why nobody could be placed.
- **Not an LLM.** The optimizer is a weighted-scoring constraint solver. An LLM
  is only used (optionally, behind `AI_FEATURES_ENABLED`) to *suggest* prose→rule
  interpretations and to phrase explanations — never to make, authorize, or
  publish scheduling decisions.

## Inputs (`GenerationInput`)

Coverage requirements, employees, positions, availability patterns, approved
leave, leave types, per-classification break policies, locked shifts, confirmed
manager rules, constraint weights, seed, and a caller-supplied `now` timestamp.

## Algorithm

1. Seed running per-employee load from locked shifts (so fairness accounts for
   pre-committed hours).
2. Order coverage requirements deterministically.
3. For each open slot, compute the **eligible** set by applying hard constraints:
   active, qualified for the position, classification eligible, location
   eligible, available (not unavailable / not on blocking leave), no overlapping
   assignment, within daily & weekly max hours, and not barred by a hard manager
   rule.
4. Score each eligible candidate against **soft** constraint weights
   (`ScheduleWeights`): fairness (distance below target load), preferred
   availability window, preferred/qualified position, evening/weekend spread,
   continuity, fragmentation penalty, and soft manager preferences.
5. Assign the top-scoring candidate; break ties deterministically.
6. Plan breaks from the classification's break policy (unpaid meal for long
   shifts placed to satisfy timing; paid rest to break up long public-service
   stretches). Exempt staff get none.
7. Validate the whole draft with the compliance engine.

### Constraint classes

- **Hard** — cannot be generated/published (unavailable, approved leave, missing
  qualification, overlap, closed location, hard max hours, required coverage,
  manager lock, prohibited compliance violation).
- **Overrideable** — manager may override with a recorded reason.
- **Warning** — proceed after acknowledgement.
- **Info** — recommendation only.

### Generation modes

`full`, `fill_only` (only uncovered slots), `coverage_only` (skip task
assignment). Repair/rebalance reuse the same solver with locked shifts preserved.

## Compliance engine (California non-exempt template)

`validateWorkday` validates an employee's **entire day**, not isolated shifts,
using a **versioned, configurable** `BreakPolicy` (never hard-coded in UI):

- Meal required after N hours; meal must begin by end of hour 5; minimum meal
  duration; second meal for long shifts; uninterrupted (duty-free) meal.
- Paid rest periods scaled to hours worked.
- Excessive continuous public-service time.
- Overlapping shifts (hard); work during approved blocking leave (hard); work
  outside availability (overrideable).
- Daily and weekly overtime warnings; split-shift info.

`validateTurnaround` checks minimum rest between consecutive days.
`validateBreakCoverage` detects a sole desk staffer taking a break with no relief
(cross-employee). **Exempt staff are exempted** — legal status is configured,
never inferred from title.

Each finding carries: plain-language message, affected employee/time, rule id,
severity, recommended remediation, and whether override is permitted. Accepted
overrides suppress the matching finding and are written to the audit log.

> The tool assists with compliance; it does not replace official HR or legal review.

## Fairness analytics

`computeFairness` produces per-employee metrics across **independent
dimensions** — total hours, public-service hours, opening/closing counts,
evening & weekend minutes, preference satisfaction, task variety, consecutive
service, and fragmentation — plus a `normalizedLoad`.

`normalizedLoad` divides an employee's public-service minutes by their **fair
share**, where the fair share is proportional to how *available* they are and
their **%FTE / target hours**. Consequently, limited availability or approved
leave shrinks the fair share instead of penalizing the person. A schedule-wide
**Gini coefficient** of public-service hours summarizes equality (0 = equal).
Fairness is never reported as a single number without this explanation.

## Manager-note interpretation

`interpretNote` deterministically parses common manager phrasings ("no more than
two consecutive hours at the desk", "don't schedule X at the desk", "prefer X
for Y") into a *proposed* `StructuredRule` with `confirmed: false`. Managers
must confirm/edit/reject before the engine applies it. `describeRule` renders the
interpretation for that confirmation step.
