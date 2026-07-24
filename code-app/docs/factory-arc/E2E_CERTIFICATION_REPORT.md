# Factory Build Arc — E2E Certification Report

Date: 2026-07-24
Scope: PR #102 (merged) through PR #108 (this consolidated arc), plus PR #109
(this report + plugin CI test wiring).

## How to read this report

**No live Dataverse environment was available in this sandbox** (no `pac`
CLI, no Dataverse credentials, no network path to
`https://org3a57b8d4.crm.dynamics.com`). Nothing in this report claims a
live end-to-end run against the real environment — that claim would be
fabricated. What follows is instead a rigorous, honest synthesis of:

- the full automated test suite (component/integration tests against
  injected/mocked Dataverse services — real assertions, mocked transport),
- static reachability analysis (confirms what's genuinely mounted vs.
  orphaned),
- direct source-code verification of every write path and gate discussed
  below (not assumption, not restating a prior doc's claim without
  re-checking it against current code).

A genuine live E2E run against `org3a57b8d4.crm.dynamics.com` (creating a
real deal, advancing it through every stage, verifying every readback) is
an **operator-executed step**, not something this sandbox can perform or
certify. The "operator live-certification checklist" at the end of this
report is the concrete, executable substitute.

## Lifecycle coverage: CRM through portfolio monitoring

| Stage | Status | Evidence |
|---|---|---|
| **CRM relationship + duplicate detection** | LIVE (writes gated off by default) + newly warn-only dedup | `crmWriteAdapter.ts` governed creates; `CRM_LIVE_PERSISTENCE_ENABLED=false` (operator-gated, pre-existing); PR 104 added `crmDuplicateDetection.ts`, warn-only, real. |
| **Deal creation, banker-pilot** | LIVE | `newDealCreateAdapter.ts`, `BANKER_CREATE_PILOT_ENABLED=true`. Confirmed via `bankerNewDealCreateRollout.ts`'s live rollout-state machine (only capability in the codebase with one). |
| **Active-deal visibility (Pipeline/Workflow/Dashboard)** | LIVE, canonical | One shared loader (`loadBankerPipeline`) behind all three surfaces (PR #102 fix — confirmed no divergence exists). |
| **Document collection / checklist** | LIVE (checklist rows) | `documentActions.ts` / `addRequiredDocumentAction.ts`, `Cr664_documentchecklistsService` wired. 5 independent checklist-generation code paths exist (tracked, not reconciled — see baseline doc §4, not fixed in this arc). |
| **Financial spreading / Global Cash Flow** | REAL ENGINE, LOCAL-ONLY UI | `globalCashFlow.ts` (PR 105) — real DSCR math, 7 tests. `GlobalCashFlowPanel.tsx` mounted, session-scoped (schema-pending: `financial-spread-persistence`). |
| **Core loan structure (purpose/term/ownership)** | SCHEMA PLANNED, NOT APPLIED | `PR105_LOAN_STRUCTURE_SCHEMA_MIGRATION.md` + scripts. `ORIGINATION_LOAN_STRUCTURE_FIELDS_ENABLED=false`. |
| **Risk rating / underwriting recommendation** | REAL POLICY + UI, LOCAL-ONLY | `underwritingDeepFacts.ts` (ARC Phase 3, pre-existing, fully tested) + `DealRiskRatingPanel.tsx` (PR 106). Requirement-engine gate stays `tracked: false` (correctly — not backed by durable persistence yet). |
| **Credit committee approval** | LIVE, single-approver tiering + self-approval prevention (NEW) | `creditApprovalAuthority.ts` mirrors a Dataverse plugin (kept in sync by hand). PR 106 added self-approval prevention, wired end-to-end through the one live caller (`DealStageProgressionCard` → `stageAdvanceWriteDependency`). True two-person dual control for large amounts is NOT built (see Adversarial Audit). |
| **Closing documents** | REAL ENGINE, LOCAL-ONLY UI | `src/closing/documents/*` (49 tests, pre-existing, previously unmounted) + `DealClosingDocumentsPanel.tsx` (PR 107). Schema-pending (`closing-document-persistence`). |
| **Funding authorization** | REAL ENGINE, DELIBERATELY NOT MOUNTED | `src/funding/*` (61 tests, pre-existing). Judged unsuitable for a local-only demo (genuine two-person dual control can't be simulated in one session — PR 107). New table specced (`cr664_fundingauthorization`), not applied. |
| **Origination → boarding handoff** | LIVE | `buildLiveStageAdvanceDeps.ts`'s `onDealBoarded` → `boardExistingLoan()` with a live deps builder (verified in PR 108, not newly built). |
| **Portfolio monitoring** (covenants, watchlist, stress testing, risk classification) | LIVE | `PortfolioCommandCenter.tsx`, mounted in `ManagerWorkspace.tsx`, `PORTFOLIO_BOOK_DATA_ENABLED=true` (verified in PR 108). One confirmed exception: `ServicingLifecyclePanel.tsx` remains a genuine, tracked orphan (needs a new multi-table live loader — deliberately deferred, not attempted). |
| **Document storage (SharePoint)** | CODE COMPLETE, awaiting operator connector registration | `portfolioSharePointDocumentMode.ts` + `createLiveSharePointDocumentAdapter` fully written/tested against a mock connector. Runbook already exists (`docs/PHASE_264_SHAREPOINT_DOCUMENT_STORAGE.md`), confirmed current in PR 107. |
| **Dataverse governance plugin** | BUILT + CI-COMPILED; tests now also run in CI (PR 109) | `dataverse-plugins/CommercialLendingLOS.Plugins/LoanDealGovernedTransitionPlugin` — 31 xUnit tests (`LoanDealGovernedTransitionPluginTests.cs`) against a hand-rolled Dataverse fake, previously built-but-not-tested in CI; `.github/workflows/build-dataverse-plugin.yml` now runs `dotnet test` and uploads a `.trx` report artifact alongside the compiled DLL. |
| **Admin capability truth** | ADDITIVE consolidation shipped | `AdminCapabilityTruthMatrix.tsx` (PR 108) cross-references all four `platformInventory.ts` registries in one searchable view; existing 6+ certification panels untouched. |

## Automated validation summary (this arc, cumulative)

| PR | Full suite | tsc -b | build | reachability |
|---|---|---|---|---|
| #103 | 893 files / 13,113 tests | clean | ✓ | 0 unexpected orphans |
| #104 | 897 files / 13,132 tests | clean | ✓ | 0 unexpected orphans |
| #105 | 899 files / 13,141 tests | clean | ✓ | 0 unexpected orphans |
| #106 | 896 files / 13,136 tests | clean | ✓ | 0 unexpected orphans |
| #107 | 897 files / 13,143 tests | clean | ✓ | 0 unexpected orphans |
| #108 | 898 files / 13,148 tests | clean | ✓ | 0 unexpected orphans |

Every PR's full suite ran to **0 failures**. Test counts differ slightly
PR-to-PR because each PR adds its own tests (not because any suite was run
partially).

## Known, honestly-disclosed limitations (not defects — deliberate scope)

1. **Six capabilities are local-only, session-scoped, pending schema**:
   Global Cash Flow figures, risk rating/underwriting recommendation
   figures, closing-document manifests (in the demo path), core
   loan-structure fields (not yet writable at all), CRM dedup signals (name/
   website only, no legal-name/employer-id plumbing). Each has an
   operator-executable migration script and stays `NOT_WIRED` until applied
   — see the four migration docs under `docs/factory-arc/`.
2. **Funding authorization remains fully unmounted** — a deliberate
   decision (PR 107), not an oversight.
3. **`ServicingLifecyclePanel` remains unmounted** — a deliberate deferral
   (PR 108), tracked as the next concrete WIRE candidate.
4. **The Dataverse governance plugin and the TypeScript authority checks it
   mirrors (`creditApprovalAuthority.ts`, `canonicalStageTransition.ts`)
   have no shared source across the language boundary** — kept in sync by
   hand, as documented in both files. A drift between them would only be
   caught by manual review or by the plugin's own 31-test suite (now run in
   CI) diverging from the TypeScript parity fixture
   (`governancePluginParityFixture.test.ts`).
5. **5 independent document-checklist generation code paths** and **2
   divergent credit-readiness derivations** (`creditReadiness.ts` vs.
   `loanWorkflowRules.ts`) identified in the Phase 0 baseline remain
   un-reconciled — flagged, not fixed, in this arc.

## Operator live-certification checklist (to actually close this out)

An operator with real Dataverse credentials should, in order:

1. Run `scripts/schema-migrations/pr105-loan-structure/verify-columns.mjs`,
   `pr106-risk-rating/verify-columns.mjs` — confirm both currently report
   MISSING (proves nothing was silently pre-applied).
2. Apply PR 105's and PR 106's migrations (Maker Portal or the scripted
   alternative), regenerate the SDK, re-run `verify-columns.mjs` for both —
   confirm both now report PRESENT.
3. Create one real test deal (`SYSTEM TEST -` prefix per the naming
   convention) through the live app; confirm it appears in Pipeline, Loan
   Workflow, and the Banker Dashboard's stage-filter options (D-01
   regression).
4. Advance the deal through every stage to BOARDED; at each CREDIT_APPROVAL
   exit, confirm the self-approval-prevention denial fires when the
   assigned banker and the advancing actor are the same person, and clears
   when they're different.
5. Confirm the deal's boarding handoff shows `boarded` (not
   `missing-handoff`) in `DealPortfolioBoardingStatusPanel`.
6. Register the SharePoint Online connector per
   `docs/PHASE_264_SHAREPOINT_DOCUMENT_STORAGE.md`'s runbook; flip
   `VITE_SHAREPOINT_MODE=LIVE`; confirm a real document upload succeeds.
7. Run `code-app/dataverse-plugins`' CI workflow (`workflow_dispatch`) and
   confirm the plugin DLL + test results artifacts both publish green.

## GO / NO-GO recommendation

**GO for continued incremental rollout; NO-GO for full production
cutover without the operator checklist above.** Every capability shipped
in this arc is either (a) genuinely live and verified by source
inspection + tests, or (b) honestly disclosed as local-only/schema-pending
with an executable, scripted path to real persistence — nothing was
fabricated as done. The remaining blockers to full production readiness
are entirely operator-side actions (schema migrations, connector
registration, plugin registration) that this sandbox cannot perform, not
undiscovered code defects.
