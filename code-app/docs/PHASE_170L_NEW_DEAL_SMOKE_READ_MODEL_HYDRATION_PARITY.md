# Phase 170L — New Deal smoke read-model hydration parity

## Phase 170K smoke create result

The Phase 170K controlled smoke create succeeded and created one TEST deal:

- Deal id: `ca41e0df-9869-f111-ab0c-70a8a59be491`
- Name: `[SMOKE TEST - PHASE 170K - DO NOT USE] TEST - New Deal Smoke 170K`
- Verify-by-reread (formatted values):
  - stage: `TEST - Stage Phase 121`
  - status: `TEST — Status Phase 121`
  - assigned banker: `Matthew Paller`

This proved the create payload and the `cr664_StageReference` /
`cr664_StatusReference` `@odata.bind` writes work end to end.

## Live Banker read-path evidence

A live Banker workspace read-path smoke then showed the new deal in **Morning
catch-up**, proving the created record is visible to the Banker workspace.
However, the Morning catch-up item read **"Stage not set"** even though the
create verify-by-reread showed the `StageReference` formatted value exists.

## Root cause

The Banker pipeline projection
[`toPipelineDeal`](../src/banker/dealQueries.ts) mapped stage/status from the
legacy SDK shadow fields:

```ts
stage: d.cr664_stagereferencename,
status: d.cr664_statusreferencename,
```

The auto-generated Power Apps SDK declares those `<attr>name` shadow fields but
does **not** populate them for lookup columns in the live environment. A deal
whose stage/status come through the `cr664_StageReference` /
`cr664_StatusReference` lookups (i.e. every deal created the governed way,
including the 170K smoke deal) therefore projected `stage = undefined`, so the
shared missing-stage data-quality signal fired "Stage not set".

This is the **same class of bug** Phase 122C (deal detail), Phase 125B
(manager `loadTeamPipeline`), and Phase 128B (team `loadTeamDeals`) already
fixed for their read models. The Banker `loadBankerPipeline` was simply never
brought to parity.

## Fixed read paths

[`src/banker/dealQueries.ts`](../src/banker/dealQueries.ts) — `toPipelineDeal`
now hydrates stage/status formatted-value-first, with the same fallback chain
the deal-detail loader uses. Because the Banker Morning catch-up
([`bankerMorningCatchUp.ts`](../src/shared/activity/bankerMorningCatchUp.ts) →
`deriveManagerMorningCatchUp`) and the Active Deals pipeline
([`PersonalPipeline.tsx`](../src/banker/PersonalPipeline.tsx)) both consume
`PipelineDeal.stage` / `.status`, this single projection fix corrects every
Banker surface that derives stage/status labels.

## Formatted-value-first rule

For every choice / lookup display column, resolve in priority order:

1. `@OData.Community.Display.V1.FormattedValue` annotation — for lookups this
   hangs off the `_<lookup>_value` key, e.g.
   `_cr664_stagereference_value@OData.Community.Display.V1.FormattedValue`.
2. The SDK-projected `<attr>name` shadow field (legacy / fixtures / future SDK).
3. For status only: the standard `statuscode` formatted value (the "Active"
   label most live deals show), then `statuscodename`.

Empty-string annotations are treated as absent and fall through. A truly unset
stage/status stays `undefined` — the honest missing-stage signal still fires.
No raw `_value` GUID is ever surfaced as a label, and no fake fallback label is
invented.

## Why the create path was not changed

This is a **read-model display/derivation** fix only. No create payload, no
`@odata.bind` logic, and no governed-create gating was touched. The Phase 170K
create path is unchanged.

## Why + New Deal remains disabled

Display parity does not change enablement. `NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED`
stays `false` and `new-deal-create` stays in `NOT_WIRED`. Production reference
approval and a governed, audited create adapter remain the outstanding gates
(Phase 170J checklist). Advance Stage / stage-progression remains a separate
blocker, untouched here.

## Validation results

- `git status --short` — only Phase 170L files changed.
- `npm test -- Banker MorningCatchUp NewDeal loadDeal loadBanker releaseCandidateSnapshot` — green.
- `npm test` — full suite green.
- `npm run build` — green.

## Deploy / tag / write statement

App read-model code changed, so this phase is deployed via
`pac code push --environment 5f2d77a5-de50-edeb-9d74-5b2400a2320d`. No
Dataverse record was created, patched, or deleted; no schema changed; no git
tag was created or moved; no permission was widened. No TEST reference row was
approved for production.
