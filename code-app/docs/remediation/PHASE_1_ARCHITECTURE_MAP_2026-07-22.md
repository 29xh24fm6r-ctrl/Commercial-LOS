# Production Readiness Remediation — Phase 1 Architecture Map

**Branch:** `fix/production-readiness-live-audit-remediation`, based on `claude/ogb-lending-e2e-cert-9oi9us` @ `2a84b13`.
Produced by six parallel read-only code audits, one per workstream cluster. No code was modified in
Phase 1. This map is the basis for Phase 2+ remediation order.

---

## A. Canonical deal/pipeline source of truth

**Root cause of 17/18/20 and $8.6M/$8.95M:** the test-deal exclusion helper
(`src/shared/deals/testDealClassification.ts`, `operationalDeals()`) is applied in exactly **one**
of five deal-count call sites — `src/banker/dealQueries.ts:132` (`loadBankerPipeline`). It is missing
from `src/manager/managerQueries.ts:172` (`loadTeamPipeline`), the derived `src/team/teamOpsQueueSnapshot.ts:224,476`,
and `src/executive/operationalFallbackQueries.ts:60,94`. Manager/Team/Executive counts include
test/smoke deals the Banker view already excludes. Team additionally **re-derives** the team-pipeline
rule independently instead of reusing Manager's `managerPipelineSnapshot` (duplication, not a logic
difference). Portfolio (`portfolioCommandSnapshot.ts:171`) correctly reuses the Manager snapshot
verbatim — a model to extend, not fix. Executive's org-wide (vs team) scope is an intentional
population difference, not a bug — needs labeling, not merging.

**Refresh:** confirmed **zero** shared data/cache layer exists (no react-query/SWR, no
invalidate/dataVersion/event-bus anywhere in `src/`). Every surface independently
`useState`+`useEffect([id])` fetches; even within one Banker session, `PersonalPipeline.tsx`,
`BankerLoanWorkflowWorkbench.tsx`, and `BankerShell.tsx`'s own top-level fetch run three independent
queries of essentially the same data. This is the entire reason a full reload is required today.

## B. Canonical stage taxonomy + Kanban

**Four vocabularies, not one**, all live:
- **A — canonical 7** (`src/workflow/stageOrderingContract.ts`): INTAKE…BOARDED. Used by the gate
  contract/transition engine/seed script. Its renderer (`StageWorkflowControl.tsx`) is **not mounted**.
- **B — legacy 9-stage "Stage Map"** (`src/shared/stages/stageCatalog.ts`): Origination…Funded.
  Drives both `DealStageProgressionCard.tsx` (the cockpit's actual Stage Map) **and**
  `src/banker/PersonalPipeline.tsx` — **the Kanban/Active Deals board**.
- **C — 11-stage legacy** (`src/workflow/loanWorkflowStages.ts`): drives `LoanWorkflowCommandCenter.tsx`.
- **D — a second, differently-scoped `STAGE_CATALOG`** (`deriveWorkflowStageSequence.ts`): credit-routing spine only.

**The Kanban board has no Intake column** because it lanes off vocabulary B, which has no INTAKE
value (new deals are created at canonical-A's INTAKE). `buildLanes()` doesn't silently drop an
unmatched stage — it buckets it into an unordered `customLanes` entry sorted to the far right
(ordinal 9999), visually indistinguishable from a genuine bad-data lane (it uses the same bucket for
literal test-stage strings like `'TEST — Stage Phase 121'`). This is documented as known, deferred
work in `docs/STAGE_RECONCILIATION_MAP.md:102-141`.

## C. Navigation and routing

React Router v6, one workspace-route registry (`src/bootstrap/workspaceRoutes.ts`), but **no
deal-route builder** — `` navigate(`/deals/${id}`) `` is hand-written independently in 16+ files.
Three confirmed, distinct root causes for the reported symptoms:
1. **Left nav dead inside a deal**: `BankerDealWorkspace.tsx:106-115` mounts `LendingOSLayout`
   without `onNavSelect` — every sidebar `NavButton` computes `disabled={!interactive}` and disables
   itself. `BankerShell.tsx` passes `onNavSelect` correctly elsewhere — the deal workspace is the one
   caller that omits it.
2. **"Open Banker Workspace" → raw RouteNotFound JSON**: `AdminOperationsConsole.tsx:130-155`
   renders this control as a plain `<a href={route}>`, not a router `<Link>`/`navigate()` — a real
   full-page browser navigation to a path the platform's own server doesn't serve the SPA shell for.
   The sibling `NewDealIntakePanel.tsx:168-175` does the equivalent correctly with `<Link to=...>`.
3. **Back returns to the same deal**: `DealCockpitNav.tsx:61-64` renders section-jump anchors as
   plain `<a href="#...">` inside a `BrowserRouter` — each click pushes a new history entry for the
   *same* URL, so a few clicks followed by Back just walks backward through duplicate entries.

Existing tests (`AdminOperationsConsole.test.tsx`) assert only the `href` **string value**, never
that clicking performs in-app navigation — exactly why this shipped unnoticed.

## D. CRM/borrower/relationship reconciliation

**Industry**: one real, correctly-designed authoritative function chain
(`dealIndustryProjection.ts` → `dealIndustryHydration.ts`) exists — not duplicated — but is defeated
by two separate problems, not one: (1) it only runs when a banker manually clicks "Check CRM
industry" in `CrmRelationshipPanel.tsx` — never automatically on workspace load; (2) `cr664_industry`
is a Dataverse choice field that gets a **platform default value** at deal creation (since the New
Deal form never sets it), which the hydration logic can't distinguish from a genuine manual banker
choice — so the "only overwrite if blank" gate is permanently defeated by data that merely looks
manual.

**Sibling deals**: two genuinely independent implementations. CRM Hub
(`crmLinkedDeals.ts`) resolves via real relationship keys (org → client → `_cr664_client_value`).
Deal Workspace (`relationshipMemory.ts`) matches by **normalized display-name string** — explicitly
documented in its own file as not a relationship-key match — and additionally scopes to only the
current banker's own visible deals, so a same-client deal owned by another banker is invisible
regardless of name match.

**Client lists**: New Deal wizard queries `cr664_clientrelationships` only; CRM Hub queries
`cr664_crmorganizations` — genuinely different tables, not a filter difference. A third path (in-deal
"Link CRM client") already unions both correctly and is the model to extend from.

## E. New Deal / loan structure capture

Wizard collects exactly: CRM client, team (optional), deal name (required), amount (**optional**).
`GovernedNewDealCreateInput`/`NEW_DEAL_CREATE_ALLOWED_FIELDS` allow-list confirms amount is optional
at the type level with no requiredness validation. **Mostly a UI gap, not a schema gap**:
`cr664_loandeal` already has generated-SDK fields for amortization months, interest-only period,
target close date, guarantor structure, collateral summary, product/product-family/loan-structure-
type/pricing-type/spread-index references, spread margin, property type, and SBA program fields —
none of them collected by the wizard or writable via `updateDealProfile.ts`'s field allow-list.
**Genuine schema gaps**: no distinct "loan purpose" field, no plain "term months" field anywhere.
No Prospect/Pre-Intake stage exists — every new deal enters canonical INTAKE immediately, which
already requires productType/loanStructure/targetCloseDate/industry/customerType to *exit* — fields
the wizard never collected walking in.

## F. Tasks vs. Signals vs. Activities

Confirmed root cause: the "Tasks & Actions" page (`MyWorkQueue.tsx`) renders
`deriveBankerWorkQueue()`, a 7-type merge where only one type (`overdue-task`) is a real
`cr664_dealtask1` row, and only its **overdue** subset — non-overdue open tasks never appear. The
nav badge (`kpis.openTaskCount`) comes from a different source (`bankerPersonalActivity.ts`, **all**
open tasks) — badge and page are structurally different populations by construction, not a rendering
bug. Real tasks are properly modeled elsewhere (`DealTasks.tsx`, `dealTaskQueries.ts`) — this is a
page-composition problem, not a missing-entity problem. Signals (`teamSignals.ts`) and Activities
(`ActivityTimeline.tsx`) are already distinct, well-modeled concepts elsewhere in the app.

## G. Document metrics + checklist flag leak

Two unmerged canonical models: a legacy 3-bucket model (`dealDocumentQueries.ts`: outstanding/
received/reviewed) feeding the cockpit/manager/portfolio views, and a newer 7-status lifecycle model
(`documentRequirementLifecycle.ts`: adds requested/under_review/waived/not_applicable) feeding only
the Due Diligence workspace. These compute genuinely different numbers for the same deal (e.g. a
waived doc has no bucket in the legacy model at all). Waive/Not-Applicable governance is already
fully compliant (reason + actor + audit + timeline) — but only in the new model.

Flag-leak confirmed at exactly `checklistWriteDependency.ts:65` → rendered raw at
`GenerateWorkflowChecklistButton.tsx:57`, and — per the role/UI-copy audit — three more of the same
pattern: `documentUploadAction.ts:143` → `ReceiveDocumentModal.tsx:253`;
`stageAdvanceWriteDependency.ts:156`/`canonicalStageTransition.ts:265` →
`StageWorkflowControl.tsx`/`DealStageProgressionCard.tsx`; `crmWritebackAdapter.ts:54` (consumer
unconfirmed). A test (`GenerateWorkflowChecklistButton.test.tsx:100`) currently *asserts* the leak as
expected behavior — it must be updated, not just the source code.

## H. Date/time integrity

A correct shared utility already exists (`src/shared/formatters.ts`: `parseCalendarDate`/
`formatCalendarDate`) and is used correctly in 2 files. Confirmed **8 concrete buggy call sites**
using raw `new Date(dateOnlyString)` → `toLocaleDateString`/comparison, each one calendar day off in
US Eastern: `ClosingForecast.tsx:79,91`, `SharedClosingCalendar.tsx:83,95`,
`operationalFallbackQueries.ts:123,135`, plus logic-only (non-display) sites affecting "overdue"
flags: `DealTasks.tsx:325`, `CompleteTaskModal.tsx:55`, `BankerShell.tsx:164,171-184`,
`teamOpsQueueSnapshot.ts` (6 sites). A third, inconsistent workaround exists in
`creditMemoDraft.ts:453-466` (forces `timeZone:'UTC'` rather than using the shared utility) — should
consolidate onto `formatCalendarDate` too. Real timestamp fields (createdon etc.) are confirmed
handled correctly elsewhere — the bug is specific to date-only business fields.

## I. Credit controls / approval governance

**No deal-scoped risk-rating or underwriting-recommendation field exists in Dataverse at all** —
confirmed by the code's own comment in `underwritingDeepFacts.ts`. Pure decision logic
(`evaluateRiskRatingReadiness` etc.) exists with no live data source. Two gating engines exist; only
one is live (`loanWorkflowRequirementEngine.ts`, via `DealStageProgressionCard.tsx`) — the other
(`stageGateContract.ts`, via unmounted `StageWorkflowControl.tsx`) hardcodes risk rating as
permanently unmet. In the live engine, risk rating/underwriting recommendation/memo-finalized/
approval-decision/approval-authority/approval-conditions are all registered `tracked: false` in
`loanWorkflowRequirementRegistry.ts` — by construction they can **never** enter the `blocking` set
regardless of value. This is a genuine schema-then-code gap, not a logic bug: there is nothing to
gate on yet. Approval-authority (committee/limit/override) is separately confirmed live and correct.

## J. Financial analysis / spreading integration

DSCR/leverage/liquidity calculations exist only in post-boarding modules
(`covenantMonitoring.ts`, `annualReview/*`) — confirmed by grep that **zero** files under `src/deals`
import from either. `intentionallyUnrouted.ts` itself already tracks both as "WIRE candidate" —
i.e., the gap is self-documented in-repo, not hidden. The credit-memo generator
(`creditMemoDraft.ts`) has zero references to DSCR/leverage/annualReview/covenant modules — its
"pricingStructure" section reads loan *pricing* spread/margin (rate structure), unrelated to
financial-statement spreading. There is currently no canonical analysis result for the memo to read
even once wired.

## K. Closing/funding/booking/portfolio handoff — correction to prior session's finding

**Important correction**: `docs/governance/LAUNCH_DEFECT_REGISTER_AND_GO_NO_GO_2026-07-22.md`
(written earlier today) asserted portfolio boarding's live persistence is off at both gating flags.
This diagnostic pass found that assertion **stale/incorrect against current code**: the actual live
auto-board path (`buildLiveStageAdvanceDeps.ts:233-261` → `mapDealToExistingLoanInput.ts` →
`existingLoanEntryAdapter.ts`) is **not gated by either flag** — its own code comment states "no
feature flag gates this... a deal reaching BOARDED boards for real immediately," and
`AUTO_STAGE_ADVANCE_ENABLED = true` is confirmed on. The two flags investigated
(`PORTFOLIO_SIDE_EFFECTS_ENABLED`, `PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED`) gate two different,
largely dead-code-adjacent paths, not this one. **This correction will be reflected in the
Phase 5/6 defect register.**

What the live adapter actually populates: loan number, borrower name, status, original/current
balance, index/spread. Product is captured but only inside an opaque extended-attributes JSON blob,
not a normal field. **Risk rating and portfolio-manager fields are real payload fields in
`ExistingLoanInput` that `mapDealToExistingLoanInput.ts` simply never populates** — risk rating
because there's no source (see I above); portfolio manager because no resolution logic was written.
No structured Commitment/Documentation/Closing-Funding write paths exist — stage-advance is the only
mechanism; intermediate stages have no dedicated data capture, only fact-placeholder fields in the
unmounted gate-contract engine. Tie-out/reconciliation exists only as an unrelated bulk-migration
schema plan, not part of this per-deal path.

## L. Role/workspace wiring — correction after implementation attempt

**Correction**: the initial diagnostic read of "Primary Workspace: Not selected" as a simple missing
`select` field turned out to be wrong once the fix was attempted. `adminUserAccessQueries.ts`'s
4-field `select` list is a **tested, pinned governance contract**
(`phase204MAdminUserAccessPlatformUserSafeReadContract.test.ts`,
`phase204NAdminUserAccessDetailPolishContract.test.ts`) recording **three separate prior live
incidents** (204K/204L/204M) where widening this exact query — including, per its own comments,
fields believed to be "just a plain lookup" — broke the entire platform-user read live. Reusing
`bootstrapFlow.ts`'s pattern here without live verification would repeat a mistake this codebase has
already paid for three times; the correct fix does not touch this select at all.

The real, narrower gap: `src/admin/adminUserAccessDisplay.ts` already ships a purpose-built,
honestly-worded helper for exactly this situation — `formatSafeReadWorkspaceName`, which renders
"Not selected by safe-read contract" instead of a bare, unexplained blank. `UserAccessManagementPanel.tsx`
already uses this helper correctly for the entitlements table (line ~215) but bypasses it for the
users table (line ~172), rendering the un-explained literal `'Not selected'` instead. **Fixed**: swap
that one render call site to use the existing helper, matching the entitlements table. No query
changed, no new live-read risk, and the label now explains itself instead of reading as a data-entry
gap. Login/landing itself is deliberately fail-closed with no default-by-role fallback (a documented
design choice, not a bug) — a user with a truly empty workspace FK correctly cannot log in and gets
an honest error; this is unrelated and working as designed.

## M. Banker-safe UI language

Confirmed 6 flag-name leak sites (§G above lists 4; add `crmWritebackAdapter.ts:54` and the two
`*Activation.ts` modules). No raw JSON/stack-trace rendering exists anywhere (verified by grep) — all
leakage is via the `.detail`/`.reason` string-passthrough pattern, where a `disabled` branch in the
same switch statement is *already* mapped to friendly copy right next to the raw `dependency_not_ready`
branch that isn't — a small, consistent fix shape repeated ~6 times. `ErrorBoundary.tsx:100` has a
secondary smaller leak (raw `error.message` in its "diagnostic" line). Good existing patterns to
extend: `ErrorState.tsx`'s `{title, detail, hint}` card.

## N. Test data / environment hygiene

`testDealClassification.ts`'s `operationalDeals()` is real, well-designed, and explicitly documents
itself as "the one canonical helper every count should route through" — but is applied in exactly
one of the many places it should be (see §A — this is the same underlying fix as Workstream A, not a
separate one). Zero equivalent classification exists for CRM organizations, tasks, or documents.
Duplicate detection (`DUPLICATE_DETECTION_ENABLED`) is deal-domain-only; no CRM-record duplicate
detection exists.

---

## Consolidated remediation sequencing (this map drives Phase 2+)

Workstreams **A and N are the same fix** (apply `operationalDeals()` everywhere) — do together first,
highest ratio of impact to risk. **G's flag-leak and M are the same fix** — do together, mechanical
and low-risk. **H is mechanical and low-risk** — batch the 8 call sites. **C's three navigation bugs
are independent, surgical, low-risk** — do together. **L is a 5-line query fix.** These six items are
Phase 2/3 in the original spec's sequencing and are tackled first in this remediation.

**B (stage taxonomy unification onto the Kanban board), D (CRM auto-hydration + sibling-deal
relationship-key fix), E (New Deal structure capture), F (Tasks/Signals split), and G's deeper
document-model merge** are larger, genuinely architectural changes — tackled next, scoped to what's
achievable without a live Dataverse write to verify.

**I (risk-rating enforcement) and J (financial-analysis integration) are schema-and-integration-scale
gaps, not code bugs** — handled the same way this repo has always handled a genuine schema
dependency (P0-2's precedent): a fail-closed, honestly-labeled current state, plus a provisioning
script/design for the operator, not a fabricated enforcement of data that doesn't exist. **K's fix is
narrow** (populate `portfolioManagerId` where resolvable; leave risk rating honestly null until I is
resolved) plus the launch-defect-register correction.
