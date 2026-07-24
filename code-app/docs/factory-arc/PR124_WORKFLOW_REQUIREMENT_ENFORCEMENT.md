# PR124 — Factory Arc Phase 12: Workflow Requirement Enforcement

## Audit

`loanWorkflowRequirementRegistry.ts` authors 16 "deep" workflow-gate requirements as `tracked: false`
(the engine fails them closed as advisory-only "future" items, never blocking a real stage advance)
because, when originally authored, none had a real backing Dataverse record. This phase re-audited
all 16 against the CURRENT codebase to find any that are now genuinely backed and should flip to
`tracked: true` — the mission mandate: never fabricate readiness, only flip a gate when a real,
durable, deal-scoped source exists.

Findings (14 of 16 remain genuinely unimplemented — no writer/record exists anywhere in the repo for
credit memo finalization, approval decision records, commitment issuance/acceptance, conditions
precedent/collateral/insurance verification, executed-docs, booking QC, or boarded-loan/servicing-
owner persistence, the last of which is built but gated off by default via
`PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED = false`):

- **`CLOSING_FUNDING:funds_disbursed`** — **STALE.** `src/funding/fundingDisbursementConfirmation.ts`
  writes a real, terminal `FUNDED` status onto a durable, deal-scoped
  `Cr664_fundingauthorization` record (`fundingAuthorizationDataverseStore.ts`), and
  `DealFundingAuthorizationPanelConnected.tsx` (formerly `DealFundingAuthorizationPanel.tsx` directly)
  mounts that store **unconditionally** in `BankerDealWorkspace.tsx` — no feature flag gates it off.
  Flipped to `tracked: true`.
- **`CREDIT_APPROVAL:approval_authority`** — investigated and **deliberately left untracked**.
  `creditApprovalAuthority.ts`'s `evaluateCreditApprovalAuthority` is real and live-enforced at the
  stage-advance write seam (`stageAdvanceWriteDependency.ts`), but it answers "is *this specific
  acting user* authorized to advance *right now*" — an actor-relative, write-time check, not a
  persisted deal-level fact. `loanWorkflowRequirementEngine.ts`'s own docstring guarantees the
  readiness preview is the "one evaluated result the UI AND the write policy can share" — flipping
  this would make the SAME deal show a different readiness verdict depending on which banker is
  viewing it, which is a correctness regression, not an enforcement improvement. No record of "this
  deal was approved by committee member X" exists anywhere to back a viewer-independent fact. Left
  `tracked: false`; the write-seam enforcement is unaffected and unchanged.

## What changed

### `funds_disbursed` flip

- `loanWorkflowRequirementRegistry.ts` — added a `tracked()` helper (mirrors `untracked()`) and moved
  `CLOSING_FUNDING:funds_disbursed` to it. `sourceEntity: 'cr664_fundingauthorization'`.
- `loanWorkflowRequirementEngine.ts` — added `WorkflowRequirementFacts.fundingAuthorization?:
  FundingAuthorizationRecord` and an `evaluateDeepFactRequirement` branch: met only when
  `authorizationStatus === 'FUNDED'`; absent/any-other-status fails closed as unmet, never fabricated.

### Wiring the fact into every live consumer (so no surface silently disagrees)

`WorkflowRequirementFacts` is constructed independently at 4 real call sites, all of which must agree
or the Stage Map / Attention Console / Metric Deck / Documents card would show inconsistent blockers
for the same deal:

- `DealDataProvider.tsx` — added a `fundingAuthorization` `AsyncResult`, loaded via
  `createDataverseFundingAuthorizationStore().getCurrentRecordForDeal(deal.id)` alongside the existing
  tasks/documents/creditMemo/activity loads. New refresh keys: `'fundingAuthorization'` and
  `'after-funding-confirmed'`.
- `DealStageProgressionCard.tsx`, `DealBlockers.tsx`, `DealMetricDeck.tsx`, `DealDocuments.tsx` — each
  already reads `useDealData()`; each now also reads `fundingAuthorization` and passes it into its own
  `WorkflowRequirementFacts` / `deriveDealBlockerModelForStage` construction.
- `creditMemoDraft.ts` — deliberately **not** wired. It is a pure function with no live-fetch
  capability, called from `CreditMemoDraftModal.tsx` (which has no `DealDataProvider` access either).
  A credit memo drafted while a deal happens to be in CLOSING_FUNDING stage will show "funds have not
  yet been disbursed" even if they have been — an honest fail-closed limitation, not a regression (the
  fact was previously untracked/invisible there too), called out here rather than silently accepted.

### Closing the refresh gap

`DealFundingAuthorizationPanel.tsx` manages its own record/store state independently of
`DealDataProvider` (a pre-existing design, unchanged). After a disbursement is confirmed there,
nothing previously told the provider its `fundingAuthorization` fact was stale. Rather than have the
base panel import `DealDataProvider` directly — which would pull the real generated-service import
graph into `DealFundingAuthorizationPanel.test.tsx`'s existing 9-test suite (that suite deliberately
renders the panel standalone, unmounted from any provider, and broke immediately when tried) — the
base panel gained one new optional prop, `onFundingConfirmed?: () => void`, fired only on a genuine
`'confirmed'` outcome. A new file, `DealFundingAuthorizationPanelConnected.tsx`, is the only consumer
of `useDealData()` in this chain: it wraps the base panel and turns `onFundingConfirmed` into
`refresh('after-funding-confirmed')`. `BankerDealWorkspace.tsx` now mounts the connected wrapper
instead of the base panel directly. The base panel's own test suite required zero changes.

## Deliberately NOT done

- **No live behavior change to any of the 14 still-genuinely-unimplemented requirements.** Their
  `untracked` reasons and `missingCapability` text were re-verified accurate, not touched.
- **No flip for `approval_authority`** — see the audit finding above; flipping it would introduce
  actor-relative readiness, a correctness bug, not an enforcement improvement.
- **`portfolioBoarding`'s live-persistence flag was not flipped** — `BOARDED:boarded_loan_record` /
  `BOARDED:servicing_owner` stay untracked; that flag's default-off state is a separate, deliberate
  gate this phase did not touch.

## Test plan

Given the higher blast radius of this change (a genuine new blocking gate on the live, armed
stage-advance write path), this phase ran a wider battery than the current speed-up directive's
per-phase default, rather than `tsc` + only the immediately-touched files:

- `npx tsc -b` — 0 errors.
- Targeted suite across every touched/adjacent surface — **26 test files, 1107 tests, 0 failed**:
  `loanWorkflowRequirementRegistry.test.ts` (12, incl. 2 new), `loanWorkflowRequirementEngine.test.ts`
  (17, incl. 2 new), `dealBlockerModel.test.ts` (7), `DealStageProgressionCard.test.tsx` (11),
  `DealBlockers.test.tsx` (3), `DealMetricDeck.test.tsx` (10), `DealDocuments.test.tsx`,
  `DealFundingAuthorizationPanel.test.tsx` (9, unchanged), `DealFundingAuthorizationPanelConnected.test.tsx`
  (2, new), `BankerDealWorkspace.test.tsx` (12), `stageAdvanceWriteDependency.test.ts` (28, one fixture
  updated to supply a FUNDED record for its BOARDED-arrival scenarios), `creditMemoDraft.test.ts` (22),
  plus 14 further CLOSING_FUNDING-adjacent governance/workflow files confirming no other surface
  regressed.
- `npm run audit:reachability` — 0 unexpected orphans (the new
  `DealFundingAuthorizationPanelConnected.tsx` is genuinely reachable via `BankerDealWorkspace.tsx`).
- Full `npm run build` deferred to the later batched checkpoint per the standing speed-up directive —
  `tsc -b` across the whole project already confirms every consumer compiles.
