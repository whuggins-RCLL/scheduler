# Cardinal Shift — Accessibility

Target: **WCAG 2.2 AA** across all major workflows.

## Implemented foundations

- **Keyboard operation.** All interactive controls are native `button`/`a`/
  `input`/`select`. The availability editor cycles state on Enter/Space via real
  buttons — **no dragging is required** for any workflow. The schedule board and
  its shift blocks are buttons; the shift editor is a focusable dialog.
- **Skip link** to `#main`; semantic landmarks (`nav[aria-label]`, `main`,
  `header`, `section[aria-labelledby]`).
- **Visible focus** — a 3px high-contrast focus ring (`:focus-visible`) on every
  focusable element, never removed.
- **Color is never the only signal.** Every status badge pairs a color with a
  text label (and a dot marker); position colors always appear alongside the
  position name/short label. Semantic state tokens are distinct from brand
  red/green.
- **Tables as first-class alternatives.** The schedule offers a List view — a
  proper `table` with `caption` and `th[scope]` — as the screen-reader/small
  screen equivalent of the visual board. Reports and admin data are tables.
- **Forms.** Labels are associated with inputs; the leave form renders an error
  summary (`role="alert"`) listing issues; required/validated fields are checked
  before submit.
- **Status announcements** use `role="status"` (saved availability, publish
  result, swap outcome).
- **Dialog** uses `role="dialog"`, `aria-modal`, `aria-labelledby`, and closes on
  backdrop click / Cancel.
- **Reduced motion** (`prefers-reduced-motion`) disables transitions/animations.
- **Reduced transparency** — both `prefers-reduced-transparency` and a manual
  top-bar toggle remove backdrop blur and use solid backgrounds.
- **Theme** — accessible light and dark themes (system/light/dark), each with
  contrast-checked tokens.
- **Target sizes** — controls are ≥ ~40px (small variant ≥32px) with spacing.
- **Responsive reflow** — sidebar collapses; grids stack; wide content scrolls
  inside its own container so the page body never scrolls horizontally.

## Testing plan

- **Automated:** add `axe-core`/`@axe-core/playwright` checks on each major
  route.
- **Keyboard-only Playwright flows:** sign in, set availability, request leave,
  view schedule, swap a shift, build/publish a schedule, invite/approve a user —
  each completed without a mouse.
- **Contrast verification** of the token palette in both themes.
- **Manual structural review checklist** (landmarks, heading order, focus order,
  no keyboard traps, no auto-dismissing critical messages, charts have tabular
  equivalents).

Automated checks alone are treated as necessary but not sufficient; the manual
checklist above is part of the definition of done for each workflow.

## Critical workflows to verify without a mouse

Sign in · set availability · request leave · view schedule (board + list) ·
swap shift · build schedule · resolve/override a compliance warning · publish ·
invite user · assign role.
