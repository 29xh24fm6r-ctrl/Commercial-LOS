# PR119 — Navigation / Activity Usability

Phase 7 of the Post-PR111 Live Activation and Audit Remediation Factory Arc: "Navigation/activity
usability."

## Defect found and fixed: Active Deals nav emphasizing the New Deal wizard

The "Active Deals" tab (`BankerShell.tsx`'s `TabContent`) always rendered the full multi-step
`BankerNewDealCreate` wizard **above** `PersonalPipeline` (the banker's actual active-deal list).
Clicking "Active Deals" in the sidebar nav — the normal way to go look at your pipeline — surfaced
a deal-creation form first, pushing the list a full form's height down the page.

### Fix

- `PersonalPipeline` now renders first on the Active Deals tab.
- The New Deal wizard is collapsed by default behind a lightweight "+ New Deal" toggle button
  (`data-banker-new-deal-toggle`) beneath the pipeline.
- The header's global "+ New Deal" shortcut (`GreetingHeader`) still expands the wizard directly —
  `newDealFocusNonce` is now threaded down to `TabContent`, which opens the panel the moment that
  nonce increments, so the existing scroll-to-target + focus-the-name-field behavior is unchanged
  for that entry point.
- A banker who navigates to Active Deals directly and then decides to create a deal clicks the new
  in-tab toggle, which expands the exact same `BankerNewDealCreate` panel used by the header
  shortcut (`data-banker-new-deal="panel"`) — no duplicated create surface.

### What did NOT change

- `BankerNewDealCreate.tsx` itself — untouched. Same component, same governed create flow, same
  Stage/Status resolver, same audit. Only *when* it's mounted changed.
- The header "+ New Deal" button and its scroll/focus behavior.

## Investigated, no reproducible defect found: "unusable Log Activity UI"

Read `LogActivityModal.tsx` (deal-scoped, opened from `GreetingHeader`) and
`CrmWriteActions.tsx`'s Log Activity action (CRM-scoped) in full. Both are complete, governed
flows: deal/activity-type selects, note textarea, optional outcome/follow-up fields, correct
disabled states while saving or when write-disabled, and honest success/partial/error outcome
messaging. `activityDealOptions` (the deal-picker's source list) is populated from the same
`loadBankerPipeline` read that backs the pipeline list itself — not a narrower, stale, or
disconnected source.

No concrete usability defect was reproducible from code inspection. This most likely matches the
Phase 6 pattern (a citation in the July 24 audit that a prior remediation pass had already
addressed) rather than an open gap — noted here rather than silently assumed fixed.

## What changed

- `src/banker/BankerShell.tsx` — reordered the Active Deals tab, added a `newDealPanelOpen` local
  state (default collapsed) driven by the existing `newDealFocusNonce`, added the in-tab toggle
  button + its style.
- `src/banker/BankerShell.test.tsx` — added a new describe block pinning: (1) navigating to Active
  Deals directly shows the pipeline with the wizard collapsed, (2) the in-tab toggle expands it,
  (3) the header shortcut still expands it directly with no extra click.

## Validation

Per the updated working-model directive: full `vitest run` / `build` / `audit:reachability` are
batched and deferred rather than re-run after every phase. This phase's own targeted validation:

- `npx tsc -b` — 0 errors
- `npx vitest run src/banker/BankerShell.test.tsx` — 39 tests, 0 failed (36 existing + 3 new)
