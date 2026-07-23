# Final Production Completion — Missing-Capability Disposition Table

**Branch:** `fix/final-production-completion`, based on synced `master` @ `1099d43f...`. Verified
against current code, not assumed missing from the historical audit. None of these capabilities were
rebuilt where an authoritative implementation already existed elsewhere in the app.

| # | Capability | Disposition | Citations | Action this pass |
|---|---|---|---|---|
| 1 | Financial spreading + global cash flow | implemented-but-gated | `src/annualReview/deriveAnnualReviewFinancialSpreadSnapshot.ts` (real engine, scoped to `annualReviewId`, post-boarding); mounted read-only-preview behind `PORTFOLIO_ANNUAL_REVIEW_ROUTE_ENABLED: false` | None — flipping the route flag is a product/operator enablement decision (read-only preview surface, no write path), not a bug fix; documented for follow-up |
| 2 | DSCR calculation and presentation | implemented-but-gated (annual-review scope); blocked-by-schema (origination/boarded-book scope) | Portfolio-level DSCR (`src/portfolio/covenants/covenantMonitoring.ts`) is real and mounted. `src/portfolio/stressTesting/stressTesting.ts:102-103` explicitly documents no NOI/DSCR field exists on the boarded-loan schema | None — schema gap requires operator-authorized Dataverse change |
| 3 | Statement/financial-data quality checks | partially-implemented | `annualReviewFinancialFacts.ts` does fact-trust/confidence filtering (not a statement-type/audited-vs-compiled classifier); `DataQualityFlags.tsx` is a system-record quality tool, different scope | None — would need to extend the existing annual-review facts model, a scoped feature addition beyond this pass |
| 4 | Live approval / committee decision flow | implemented-but-gated | `src/committee/CreditCommitteePackageReviewQueuePanel.tsx` mounted behind `COMMITTEE_ROUTE_ENABLED: false`, fed `deriveCreditCommitteePackageQueue(undefined)` (no live loader yet). Export/e-sign panels remain fully unrouted | None — same class of decision as #1; route flip + live loader wiring is a scoped follow-up, not a defect fix |
| 5 | Closing-document generation | missing | Only readiness/gate tracking exists (`src/workflow/closingReadiness.ts`); no generator, no e-sign send | None — genuinely missing; would be new build, not a wiring fix; out of scope for a remediation pass |
| 6 | Funding authorization | missing | No `fundingAuthorization`/`disbursementApproval` module exists anywhere; `CLOSING_FUNDING` is a workflow-stage label only | None — genuinely missing; new build required |
| 7 | Document-checklist auto-generation | implemented-but-gated | `DOCUMENT_CHECKLIST_GENERATION_ENABLED = false` (confirmed live); generator code exists, unrouted; button hard-disabled while flag is false | None this pass — see Operator Runbook 2 for the exact evidence-capture + flag-flip sequence; flipping is a deliberate governed-cutover decision |
| 8 | Portfolio book tie-out | implemented-and-mounted (using operator-entered control totals); blocked-by-schema for full auto-tie | `src/portfolio/reconciliation/bookReconciliation.ts` (real engine) mounted as `MigrationReconciliationPanel`; `cr664_portfoliomigrationcontrol`/`cr664_migrationbatchid` not yet provisioned live for full automation. Distinct from the Workstream K BOARDING-specific gap (risk rating/manager/tie-out on the boarded-loan record itself, which remains a separate, still-open item) | None — schema gap for full automation; today's manual-control-total flow already works |
| 9 | Covenant/exception/watchlist/loan-review/early-warning | implemented-and-mounted (exceptions partial) | `CovenantReviewPanel`, `WatchlistBoardPanel`, `EarlyWarningPanel`, `LoanReviewPanel` all mounted with real data. `creditAdminExceptions.ts` engine exists but has no live loader — `PortfolioCommandCenter.tsx` explicitly passes `dataAvailable={false}` | None this pass — wiring `creditAdminExceptions.ts` to a real completeness loader is a scoped, non-trivial follow-up (need to identify/build the loader), not a one-line fix |
| 10 | Product auto-boarding | implemented-and-mounted, confirmed live | `buildLiveStageAdvanceDeps.ts`'s `onDealBoarded`, no flag gates it; Workstream K locked in with a regression test | None needed |
| 11 | Unified/borrower communication history | implemented-and-mounted | `src/deals/BorrowerCommunication.tsx`, mounted in `BankerDealWorkspace.tsx` | None needed |
| 12 | Due dates for tasks and documents | implemented-and-mounted | `dealTaskQueries.ts`/`dealDocumentQueries.ts` type + populate `dueDate` from live columns; displayed throughout | None needed |
| 13 | Loan purpose, term, ownership-status capture | blocked-by-schema | `BankerNewDealCreate.tsx:826-827` explicitly documents: not yet captured, needs new Dataverse fields this environment does not have | None — requires operator-authorized schema change; see proposed schema note below |
| 14 | Required-borrower-relationship validation | implemented-and-mounted | `newDealCreateAdapter.ts` fails closed (`client_required`) when `requireCrmClient===true`, which `BankerNewDealCreate.tsx` always passes; no escape hatch armed | None needed |

## Proposed schema for item 13 (loan purpose / term / ownership status) — PREPARED, NOT APPLIED

Consistent with the no-schema-change-without-authorization guardrail, no migration was run. If the
business wants to close this gap, the minimal additive shape is three new optional fields on
`cr664_loandeals`:
- `cr664_loanpurpose` (text or option set — recommend option set for reporting consistency: e.g.
  Acquisition / Refinance / Working Capital / Expansion / Other)
- `cr664_loanterm` (whole number, months)
- `cr664_ownershipstatus` (option set: Owner-Occupied / Investment / Other)

All three are purely additive (no migration/backfill risk to existing rows — they default to null/
unset), would need a corresponding SDK regeneration (`pac code add-data-source`), and a form-field
addition in `BankerNewDealCreate.tsx` alongside the existing `requiredFields` catalog in
`loanWorkflowStages.ts` if the business wants them to become INTAKE exit criteria. Rollback is
deleting the unused fields — no data-loss risk since nothing else references them.

## Summary

- **implemented-and-mounted (no action needed):** 10, 11, 12, 14 — 4
- **implemented-but-gated (route/flag flip is a product decision, not a bug):** 1, 4, 7 — 3
- **implemented-but-gated + blocked-by-schema (partial):** 2, 8 — 2
- **partially-implemented (extend existing, don't rebuild):** 3, 9 — 2
- **blocked-by-schema (requires operator-authorized Dataverse change):** 13 — 1
- **missing (genuine new build, out of remediation scope):** 5, 6 — 2

No capability required (or received) a duplicate/substitute engine — every gated or partial item
reuses an existing, already-correct implementation.
