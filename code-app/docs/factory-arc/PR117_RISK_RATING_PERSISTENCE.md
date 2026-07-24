# PR117 — Risk Rating / Underwriting Recommendation Persistence

Phase 5 of the Post-PR111 Live Activation and Audit Remediation Factory Arc: "Risk rating /
underwriting recommendation persistence."

## What this closes

`DealRiskRatingPanel.tsx`'s `RiskRatingRecord` and `UnderwritingRecommendationRecord` —
previously local-only, reset on reload — now persist to `cr664_riskratinginputs` and
`cr664_underwritingrecommendationinputs` (two PR106-provisioned Memo/JSON columns) through the
same governed `updateDealProfile.ts` pipeline as the other deal-profile fields, and load back on
mount. Each record has its own independent Save button, since they're distinct facts an
underwriter may set at different times.

This closes `platformInventory.ts`'s `risk-rating-persistence` NOT_WIRED gap (see
`platformInventory.test.ts`'s `expect(ids.has('risk-rating-persistence')).toBe(false)`).

## What this does NOT close

Persisting these records does **not** flip the `UNDERWRITING:risk_rating` /
underwriting-recommendation entries in the CREDIT_APPROVAL requirement registry
(`workflow/underwritingDeepFacts.ts`) from `tracked: false` to `true`. That file's own header
comment already documents this as a separate, explicitly-reviewed decision, and this phase
respects that boundary deliberately — fabricating durable gate enforcement backed only by this
panel's write, without that separate review, would be exactly the kind of unreviewed governance
change this codebase's discipline exists to prevent. The readiness preview in the panel still only
shows what the gate *would* say.

## Why this didn't wait on Phase 2's SDK regeneration

Same reasoning as Phase 3 (PR115) and Phase 4 (PR116): both columns are plain Memo (long text)
columns, not multi-select or lookups, so they round-trip correctly through
`Cr664_loandealsService.update`/`get` today by raw column name even though the generated
`Cr664_loandealsModel.ts` doesn't declare them yet. `updateDealProfile.ts`'s `maxLength` guard
(reused from Phase 3/4) bounds each field at its real 1,048,576-char Memo ceiling.

## What changed

- `src/workflow/underwritingDeepFacts.ts` — added `RiskRatingFormState` /
  `UnderwritingRecommendationFormState` (the banker-entered fields, persisted independently of
  `dealId`/`assignedBy`/`underwriterActor`, which stay actor-derived context rather than persisted
  form data) plus fail-closed serialize/parse for each. An unrecognized `status` or `decision`
  value in saved JSON falls back to the safe default (`draft` / `approve`) rather than propagating
  an invalid enum the `<select>` wouldn't recognize.
- `src/deals/write/updateDealProfile.ts` — added `riskRatingInputs`
  (→ `cr664_riskratinginputs`) and `underwritingRecommendationInputs`
  (→ `cr664_underwritingrecommendationinputs`), both text/maxLength 1,048,576.
- `src/deals/dealQueries.ts` — added `riskRatingInputsJson` / `underwritingRecommendationInputsJson`
  to `DealDetail` and `mapDealDetail`, read off the raw retrieve row.
- `src/deals/DealRiskRatingPanel.tsx` — now takes `{ deal, ratedBy, authorized, actorEmail,
  actorSystemUserId }` as props (mirroring the Phase 4 `GlobalCashFlowPanel` convention). Both
  form sections initialize from the deal's saved JSON on mount. Each section (Risk rating,
  Underwriting recommendation) gets its own explicit Save button and inline outcome note, so one
  can be saved without the other. Unauthorized users see both buttons disabled with an honest
  reason; the readiness preview still computes.
- `src/deals/BankerDealWorkspace.tsx` — passes `deal`, `authorized={Boolean(systemUserId)}`,
  `actorEmail={email}`, `actorSystemUserId={systemUserId}` alongside the existing `ratedBy`.
- `src/shared/governance/platformInventory.ts` — removed the now-resolved
  `risk-rating-persistence` NOT_WIRED entry.
- Updated the NOT_WIRED count and doc/test citations in the same four files as Phase 3/4.

## What did NOT change

- No generated SDK file was touched.
- The `tracked: false` status of the CREDIT_APPROVAL risk-rating / recommendation requirement
  entries — deliberately, see above.
- `cr664_loanpurpose` / `cr664_loantermmonths` / `cr664_ownershipstructure` (Phase 3) and
  `cr664_financialspreadinputs` (Phase 4) are untouched.

## Validation

- `npx tsc -b` — 0 errors
- `npx vitest run` — 907 test files, 13274 passed / 2 skipped (pre-existing), 0 failed
- `npm run audit:reachability` — 0 unexpected orphans (1065 non-test sources / 778 reachable / 287
  allow-listed)
- `npm run build` — succeeds
