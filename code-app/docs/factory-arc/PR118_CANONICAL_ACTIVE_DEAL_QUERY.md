# PR118 — Canonical Active-Deal Query

Phase 6 of the Post-PR111 Live Activation and Audit Remediation Factory Arc: "Canonical active-deal
query."

## Investigation

Mapped every place in the codebase that computes or displays an "active deal" count — Banker
Workspace, Manager Bloomberg Control Panel, Team Ops Queue, Executive Command Center, Portfolio,
and the Admin platform-view catalog.

**Finding 1 — the documented reconciliation bug from the July audit is already fixed.**
`docs/remediation/PHASE_1_ARCHITECTURE_MAP_2026-07-22.md` §A documents a prior defect: the
test/smoke-deal exclusion helper (`operationalDeals()` / `isTestOrSmokeDealName()`) was applied at
only one of five deal-count call sites, so Manager/Team/Executive counts included test/smoke
records the Banker view already excluded. Checking current code against that doc: `managerQueries.ts`,
`teamQueries.ts`, and `operationalFallbackQueries.ts` all now call the exclusion helper. That fix
already landed in a prior remediation pass — no code change was needed for it here.

**Finding 2 — the underlying "active" predicate itself was never actually shared.** Even after the
test-deal-exclusion fix, the literal OData predicate string
`statecode eq 0 and (cr664_isterminalstatus eq false or cr664_isterminalstatus eq null)` was
independently retyped in three places with no shared source:

- `src/banker/dealQueries.ts` (`loadBankerPipeline`)
- `src/executive/operationalFallbackQueries.ts` — **twice**, once each in
  `loadPipelineByStageFallback` and `loadClosingForecastFallback`
- `src/shared/deals/dealVisibilityScopes.ts`'s `buildTeamVisibilityFilter` (consumed by both
  Manager's `loadTeamPipeline` and Team's `loadTeamDeals`)

Four copies of the identical literal string is exactly the shape of bug that produced the July
audit's reconciliation failure in the first place — it just hadn't drifted (yet) for this specific
predicate. This phase closes that latent risk before it becomes a real one.

## What changed

- `src/shared/deals/dealVisibilityScopes.ts` — extracted the literal into an exported
  `ACTIVE_DEAL_ODATA_PREDICATE` constant. `buildTeamVisibilityFilter` now references it instead of
  a local copy.
- `src/banker/dealQueries.ts` — `loadBankerPipeline` now imports and uses the constant.
- `src/executive/operationalFallbackQueries.ts` — both `loadPipelineByStageFallback` and
  `loadClosingForecastFallback` now use the constant (their filter literally *is* the predicate now,
  since neither adds any other clause).
- `src/shared/deals/dealVisibilityScopes.test.ts` — added a regression-guard describe block that
  reads the source of all three consumer files and asserts (a) each imports
  `ACTIVE_DEAL_ODATA_PREDICATE`, and (b) the raw literal string is declared in exactly one place
  (this module) and appears zero times as a re-typed copy elsewhere. A future edit to the
  active-deal rule that only touches one file will now fail this test instead of silently drifting.
- `src/executive/operationalFallbackQueries.test.ts` (**new** — this file had zero prior test
  coverage) — covers both aggregate functions: stage/month bucketing, test-deal exclusion,
  no-stage/no-date fallback labels, past-date bucketing, and fail-closed error propagation on a
  failed read, plus the canonical-predicate-usage assertion.

## What did NOT change

- `src/banker/bankerCommandCenterWorkModel.ts`'s `deriveBankerPipelineByStage` re-filters
  `!d.isClosed` on its input. Investigated and left alone: it's a pure function that doesn't trust
  its caller, re-deriving "active" from the same `isClosed` field already computed upstream — a
  defensive no-op given correct input, not an independent predicate that could drift. Removing it
  would only remove a safety net for no behavioral gain.
- `src/platform/platformViewRegistry.ts`'s `banker_active_deals` catalog entry
  (`{ field: 'status', operator: 'neq', value: 'closed' }`) is declarative admin-catalog metadata
  describing a view-model-level field, consistent with every other entry in that registry (which
  all use abstracted, non-Dataverse field names). It's not a live executable query and not part of
  the reconciliation chain — left as-is.
- No generated SDK file was touched.

## Validation

- `npx tsc -b` — 0 errors
- `npx vitest run` — 908 test files, 13265 passed / 2 skipped (pre-existing), 0 failed
- `npm run audit:reachability` — 0 unexpected orphans (1065 non-test sources / 778 reachable / 287
  allow-listed)
- `npm run build` — succeeds
