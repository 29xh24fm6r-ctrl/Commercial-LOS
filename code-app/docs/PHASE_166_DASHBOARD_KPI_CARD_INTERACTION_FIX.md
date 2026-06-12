# Phase 166 -- Dashboard KPI Card Interaction Fix

Date: 2026-06-12
Baseline before this phase: eefaa61 (Phase 164 controlled pilot package),
deployed via Phase 165.

## Live Smoke Failure Observed

During the V1.0 controlled-pilot live smoke, the operator found that the
ten top-of-dashboard banker KPI cards (Pipeline, Weighted, Active Deals,
Urgent, Closing Soon, YTD Closed, Win Rate, High Prob, Stale 14d+, In UW)
did not open anything when clicked. CRM Command Center "View details"
drill-through cards worked; the top KPI cards did not.

## Root Cause

`src/banker/BankerKpiGrid.tsx` rendered every KPI tile as a plain `<div>`
with no click handler, no button/link semantics, and no `cursor: pointer`.
None of the ten cards was ever interactive -- there was no regression to
"break"; the affordance simply did not exist. The honest fix is to make a
card interactive only when it has a real existing destination, and to
leave the rest as clearly non-clickable cards.

## What Changed

A KPI tile is now a real `<button>` only when it has an honest existing
in-page destination (an existing shell tab). Tiles without an honest
destination remain plain, non-clickable `<div>`s with no pointer cursor
and no button semantics. No new routes were added; tab selection is the
existing in-page `setTab` state, so the route delta is 0.

### Cards now clickable (real destinations)

| Card | Opens | Why this is honest |
| --- | --- | --- |
| Pipeline | Active Deals tab | Pipeline dollars are the sum across active deals; the Active Deals board is the only honest drill target. |
| Active Deals | Active Deals tab | Direct, literal destination. |
| Urgent | My Alerts tab | The My Alerts tab's count badge is this exact urgent-item count; My Alerts owns overdue tasks / docs / closes. |
| In UW | Active Deals tab | The Active Deals board is stage-grouped with an Underwriting lane and an existing stage filter -- a real view of these deals. |

### Cards intentionally left non-clickable

| Card | Why non-clickable |
| --- | --- |
| Weighted | "Not yet wired" -- needs a `cr664_loandeal.probability` field absent from the live schema (Phase 118 bucket C). |
| YTD Closed | "Not yet wired" -- needs a closed-won flag + close date the live schema does not surface (bucket C). |
| Win Rate | "Not yet wired" -- needs a closed-won vs closed-lost discriminator (bucket C). |
| High Prob | "Not yet wired" -- needs a probability field (bucket C). |
| Closing Soon | No dedicated target-close tab view exists. The right-rail "Today's Schedule" already lists these, but there is no honest filtered tab to open. |
| Stale 14d+ | No dedicated stale / no-activity tab view exists today. |

No fake drill-through panel, no fabricated metric, and no fake filtered
view was introduced for any of the non-clickable cards. They keep their
honest "Not yet wired" copy or their plain count with no false
clickability.

## Accessibility

- Clickable tiles are native `<button type="button">` elements:
  keyboard activation (Enter / Space) works for free and the browser
  focus-visible ring is preserved (outline is not removed).
- Each clickable tile has an `aria-label` naming its value and
  destination, for example: "Active Deals: 4. Open the Active Deals tab."
- Non-clickable tiles remain `<div>`s with no `cursor: pointer` and no
  button/link role, so they do not advertise clickability.
- The interactive tile uses longhand `border`/`background` CSS (not the
  shorthands) so the var(--cc-*) themed colors do not trip a jsdom
  shorthand-parsing bug during test-time accessible-name computation.
  Visually the button is identical to the non-clickable tile.

## Guardrails Honored

- No fake data, no invented metric values.
- + New Deal not wired; still an honest disabled placeholder.
- No schema, no migrations, no Dataverse records.
- No CRM or Copilot live connector enabled.
- No permission widening.
- No external HTTP / fetch / Graph calls introduced.
- Route delta 0 (tab selection is existing in-page state; no router change).
- CRM drill-through behavior unchanged.

## Files Changed

- `src/banker/BankerKpiGrid.tsx` -- interactive tiles + honest targets.
- `src/banker/BankerShell.tsx` -- passes `onSelectTab={setTab}` to the grid.
- `src/banker/BankerShell.test.tsx` -- Phase 166 interaction tests.

## Tests Added (Phase 166 block in BankerShell.test.tsx)

1. Active Deals KPI click selects the Active Deals tab (and swaps panel).
2. Urgent KPI click selects the My Alerts tab.
3. In UW KPI click selects the Active Deals tab.
4. Keyboard activation (Enter) works on a clickable KPI tile.
5. Not-yet-wired / no-destination tiles are NOT buttons and carry no
   `data-kpi-target` and no pointer cursor.
6. Clickable tiles expose an honest destination-naming `aria-label`.
7. CRM Command Center still renders and + New Deal stays disabled /
   Log Activity stays available after a KPI-driven tab change.

CRM drill-through behavior is covered by the existing
`CrmBankerWorkingSurface` tests, which remain green.

## Validation Results

- `npm test -- BankerShell CrmBankerWorkingSurface logActivityActions releaseCandidateSnapshot`: passed.
- `npm test`: passed (full suite).
- `npm run build`: passed (existing Vite chunk-size warning only).
- `git status --short`: only the four files above plus this doc.

## Release Status

The V1.0 controlled-pilot tag remains PENDING. This fix must be
redeployed (Phase 165 `pac code push`) and the live smoke checklist in
`docs/PHASE_164_V1_CONTROLLED_PILOT_RELEASE_PACKAGE.md` section 5 re-run
in the deployed environment -- including re-verifying the top KPI cards --
before `v1.0.0-controlled-pilot` is created. Deployment is not smoke
certification.
