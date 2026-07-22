# Workstream K — Narrow the Portfolio-Boarding Field Gap

**Branch:** `fix/production-readiness-live-audit-remediation`. Scope: with auto-boarding already
confirmed live (`AUTO_STAGE_ADVANCE_ENABLED = true`, no feature flag gates the BOARDED-stage
write), identify and close only the verified missing required fields at auto-board time — product,
risk rating, relationship/portfolio manager, tie-out result — at the correct upstream/boarding
boundary, without inventing data or weakening the existing manual-boarding path.

## Live auto-board path (confirmed by direct code read)

`stageAdvanceWriteDependency.ts` → on `policy.to === 'BOARDED'` → `buildLiveStageAdvanceDeps.ts`'s
`onDealBoarded.run(deal)` (unconditional, no flag) → `mapDealToExistingLoanInput.ts` (maps
`DealDetail` → `ExistingLoanInput`) → `existingLoanEntryAdapter.ts`'s `boardExistingLoan()` (the
SAME governed write path `ExistingPortfolioLoansPanel.tsx`'s manual entry form already uses) →
`cr664_portfolioboardedloans` root record, with extended attributes additionally persisted into the
`cr664_extendedloanattributes` JSON blob when `EXTENDED_LOAN_ATTRIBUTES_PERSISTENCE_ENABLED` (`true`
today, no override at the auto-board call site).

## Field-by-field disposition

### 1. Product — CONFIRMED NOT A GAP (no code change made)

`deal.productType` is set on `ExistingLoanInput.product` by the mapper
(`mapDealToExistingLoanInput.ts:51`), then written into the extended-attributes blob by
`buildRootPayload` (`existingLoanEntryAdapter.ts:266-282`) via `buildExtendedLoanAttributes({product:
input.product, ...})` → `serializeExtendedLoanAttributes` → `payload[cr664_extendedloanattributes]`.
The auto-board call site passes no `options` override, so `persistExtended` defaults to `true`
(`existingLoanEntryAdapter.ts:315`). This chain was previously untested end-to-end (existing tests
covered the mapper's own field mapping and the adapter's payload construction separately, but not
the full chain together). **Closed by adding a regression test, not a code change:**
`src/portfolioBoarding/autoBoardProductChain.test.ts` — asserts `deal.productType` survives the
mapper → adapter → parsed blob round trip, and separately pins that risk rating / portfolio manager
are NOT fabricated along the same path.

### 2. Risk rating — GENUINE GAP, requires an operator/product decision (not coded)

- `cr664_currentriskrating` exists on `cr664_portfolioboardedloans` and is already fully wired on
  the **manual** boarding path (`ExistingPortfolioLoansPanel.tsx` → `boardExistingLoan`).
- `DealDetail` (the origination-side record) carries **no risk-rating field at all** today. The
  closest schema slot, `cr664_RiskLevelReference` on `cr664_loandeals`, has no generated
  reference-table model/service anywhere in `src/generated/` — it is an unusable lookup slot without
  SDK regeneration and populated reference values (same underlying gap independently documented in
  `docs/LOS_WORKFLOW_TRUTH_MATRIX.md`'s T2 section and already deferred there as "PR 6").
- **Why this was not coded:** there is no authoritative upstream value to map. Populating
  `currentRiskRating` at auto-board time would require either (a) fabricating a value (forbidden by
  every guardrail in this initiative) or (b) a new deal-scoped risk-rating field/lookup plus a
  resolved reference table — a schema change requiring operator authorization. See the Workstream
  I/J dependency report (`WORKSTREAM_IJ_CREDIT_CONTROLS_DEPENDENCY_REPORT_2026-07-22.md`) for the
  exact proposed schema shape; the same missing field blocks both K's boarding gap and I/J's
  Credit-Approval-entry risk-rating gate.

### 3. Relationship / portfolio manager — GENUINE GAP, requires an operator/product decision (not coded)

- `cr664_PortfolioManager` is a `systemuser` lookup on `cr664_portfolioboardedloans`, already fully
  wired on the manual path (`portfolioManagerId` → `@odata.bind`, `existingLoanEntryAdapter.ts:258-262`,
  covered by the existing `WI-2` tests).
- `DealDetail` carries `bankerName` (a display string, not a `systemuser` id) but no relationship-
  manager or portfolio-manager **systemuser reference** of any kind. There is no resolver anywhere in
  `src/` that turns a banker display name into a `systemuser` id with any reliability (name collision,
  no unique-match guarantee) — attempting to "look one up" at auto-board time would risk silently
  binding the wrong operator's record, a worse outcome than leaving the field unset.
- **Why this was not coded:** mapping `bankerName` → a resolved `systemuser` id is not a pure,
  deterministic, fabrication-free operation with today's schema. It needs either a genuine
  `systemuser`-typed field captured earlier in origination (so the deal itself carries the id, not
  just a name), or an explicit, reviewed name-resolution service — both are product/schema decisions,
  not code-only fixes.

### 4. Tie-out result — GENUINE GAP, requires a product decision + new schema (not coded)

- No column, field, or record of any kind representing a "tie-out" (reconciliation between
  origination figures and the boarded core-system record) exists anywhere in the current schema —
  confirmed by grep across `src/generated/models` and the `cr664_portfolioboardedloans` field list.
- **Why this was not coded:** there is nothing to wire. A tie-out result requires (a) a defined
  tie-out process/checklist (a product decision on what "tied out" means and who performs it) and
  (b) a new field/entity to record the outcome. Documented here as a flagged gap for operator
  decision; no placeholder or synthetic value was introduced.

## What changed in this workstream

- **Added:** `src/portfolioBoarding/autoBoardProductChain.test.ts` — locks in that Product already
  flows correctly end-to-end through auto-boarding, and that risk rating / portfolio manager are
  correctly NOT fabricated along the same path.
- **Not changed:** no schema, no mapper logic, no adapter logic. Risk rating, portfolio manager, and
  tie-out result remain genuinely absent upstream; introducing any of them without an authoritative
  source or operator-approved schema change would violate the no-fabrication guardrail for this
  initiative.

## Recommended next step (requires operator sign-off, not part of this workstream)

1. Decide whether risk rating should be captured earlier in origination (on `cr664_loandeals`) or
   assigned at boarding time by a reviewer — this determines whether the new field belongs upstream
   or on the boarding record itself.
2. Decide whether relationship/portfolio-manager assignment should be captured as a `systemuser`
   lookup earlier in origination (recommended — avoids name-resolution ambiguity entirely) rather
   than resolved at boarding time.
3. Define the tie-out process and the minimal field(s) needed to record its outcome.

None of the above are implemented here; see the Workstream I/J dependency report for the exact
proposed schema changes, since risk rating is a shared dependency between K and I/J.
