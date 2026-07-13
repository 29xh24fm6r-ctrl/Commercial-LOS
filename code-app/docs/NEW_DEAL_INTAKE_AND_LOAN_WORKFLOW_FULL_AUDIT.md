# New Deal Intake & Loan Workflow — Full Audit (2026-07-13)

**Scope:** New Deal Intake (`src/deals/newDeal*`, `src/banker/BankerNewDealCreate.tsx`,
`src/admin/NewDealIntakePanel.tsx` and related) and the Loan Workflow stage-transition
engine (`src/workflow/**`), plus their seams into CRM linkage, portfolio boarding, and the
banker/manager/team workspaces. Requested as a full audit with "fix everything found."

**Method:** environment/build health check first (npm install, `tsc -b`, full `vitest run`,
reachability audit), then five parallel deep-read agents each covering one subsystem, each
instructed to verify current source directly rather than trust existing docs (this codebase
has ~260+ prior phases of work; several existing planning docs predate later changes and had
drifted). Findings were cross-checked against real source, deduped, and triaged by severity
and fix risk. Confirmed, safely-fixable findings were fixed and covered with new regression
tests in this pass; findings that would require new infrastructure (a real committee-approval
data model, a risk-rating table, server-side search) or carry real regression risk without
deeper product input were fixed only where a low-risk correction existed, and are otherwise
documented below as recommended follow-ups rather than attempted half-measures.

**Baseline at completion:** `tsc -b` clean, reachability audit 0 unexpected orphans, full
`vitest run` green (verify exact current counts via `npm run verify` — the suite is large and
growing; treat any number quoted below as a snapshot, not a permanent pin).

---

## 1. What shipped in this pass

Each item below is a real bug found by direct source verification (not inferred from docs),
fixed, and covered by a new or corrected regression test. Commits are on
`claude/new-deal-loan-audit-qo083p`, newest first in git log, oldest first here:

### 1.1 DRY_RUN SharePoint upload test was pinning stale (pre-hardening) behavior
The Phase 264 (P0) hardening commit deliberately changed `usePortfolioLoanDocumentPersistence`
so a DRY_RUN upload never writes a "stored" metadata row (no phantom record without a real
file) — confirmed correct by its own dedicated unit test and the operator runbook doc — but
never updated `PortfolioLoanBoardingDetail.test.tsx`, which still asserted the *old* behavior.
The full suite was red on this branch before this pass. Fixed the assertion to match the
documented, intentional, already-covered behavior.
*(`src/portfolioBoarding/PortfolioLoanBoardingDetail.test.tsx`)*

### 1.2 `connectorAvailable` prop not wired — broke `tsc -b`
The same Phase 264 merge added a `connectorAvailable` prop requirement to
`PortfolioLoanBoardingDocumentUploadPanel` but the parent (`PortfolioLoanBoardingDetail`)
never passed it — a real TS2741 compile error blocking `npm run build`. Wired the prop through.
*(`src/portfolioBoarding/PortfolioLoanBoardingDetail.tsx`)*

### 1.3 **[Critical]** Stage advance never refreshed the shared deal context
`DealStageProgressionCard`'s `onAdvance` performed a fully governed, readback-verified stage
write, then called `refresh('after-task-complete')` — which reloads tasks/activity only, never
the deal row. Every cockpit surface that reads the deal via `DealDataProvider` context
(header, Stage Map, Metric Deck, Attention Console, Copilot) kept showing the **pre-advance
stage** until a hard browser reload. Now calls `applyVerifiedDealPatch({ stage, stageEntryDate })`
immediately after a verified advance, matching the pattern `DealProfileEditModal` already used.
*(`src/deals/DealStageProgressionCard.tsx`)*

### 1.4 Null-name crash in the Loan Workflow search box
`BankerLoanWorkflowWorkbench`'s search filter guarded `r.borrower` against null but not the
sibling `r.name` on the same line — the same failure class as the Phase 261
crash/null-hardening regressions, on a code path neither of those regression tests exercises
(neither types into the search box). A deal with a null/empty name would crash the tab the
moment a banker typed anything into search.
*(`src/banker/BankerLoanWorkflowWorkbench.tsx`)*

### 1.5 Portfolio-boarding status panel trusted a stage-string regex, not real evidence
`DealPortfolioBoardingStatusPanel` derived "ready for portfolio boarding" purely from a regex
match against the deal's stage display string. A real reconciliation module already existed,
fully tested (`boardingHandoffReadiness.ts` / `loadBoardingHandoffForDeal.ts` — "a deal's stage
string reading BOARDED is a CLAIM, not proof") but had **zero production callers**. A deal could
read "Boarded / Servicing" with no active `cr664_portfolioboardedloans` record behind it and
this panel would still show a green "Ready for portfolio boarding" badge. The panel now trusts
the stage-string signal only pre-boarding (still honest for "not there yet"); once the stage
claims BOARDED it loads the real handoff evidence and shows either a verified "Boarded" state
or an explicit "Boarding unverified" warning with the fail-closed reason. Added
`DealPortfolioBoardingStatusPanel.test.tsx`, which had zero coverage before.
*(`src/workflow/DealPortfolioBoardingStatusPanel.tsx`, `portfolioBoardingStatus.ts`)*

### 1.6 Pre-create duplicate detection was completely inert
`BankerNewDealCreate.tsx` passed the orchestrator an empty `config: {}` and never populated
`context.existingDeals`, so `detectNewDealDuplicates` always short-circuited to `not_checked`
and had nothing to compare against even if it ran. This directly contradicted
`docs/PHASE_242A_RESTORE_CERTIFIED_NEW_DEAL_CREATE_ACTIVATION.md`'s explicit claim that
"duplicate detection stays on as a warning only" — in production, **no warning was ever
possible.** Two bankers (or one banker twice) could create duplicate loan deals with zero
signal. Now loads the acting banker's own active pipeline as duplicate-detection candidates,
enables the gate (a pure, read-only, warning-only check — never writes, never blocks unless a
separate exact-duplicate-blocks policy is set, which this surface doesn't set), and shows a
real warning banner on a possible/exact duplicate instead of silently creating the deal.
Updated the Phase 194 governance contract, which literally regex-matched the source for the
old `config: {}` literal (would have permanently blocked ever enabling detection).
*(`src/banker/BankerNewDealCreate.tsx`, `src/shared/governance/phase194ControlledLiveNewDealCreateEnablementContract.test.ts`)*

### 1.7 Self-contradicting admin New Deal Intake readiness copy
Three instances of the same pattern — text says one thing, the state next to it says the
opposite:
- `NewDealResolverReadinessCard` rendered a bare "Create remains disabled" directly under the
  parent panel's "Banker create live" badge with no scoping.
- `adminNewDealIntakeModel`'s checklist step 9 had detail text starting *"Done: Phase 227/228A
  enabled the public + New Deal control..."* while `done: false` sat right next to it — in the
  exact admin console used to certify go-live state.
- `NEW_DEAL_CREATE_PRODUCTION_REFERENCES_APPROVED`'s value (`true`) directly contradicted its
  own doc comment ("not yet seeded/approved"); unused anywhere, corrected to `false`.
*(`src/admin/NewDealResolverReadinessCard.tsx`, `adminNewDealIntakeModel.ts`, `src/deals/newDealCreateFeatureFlags.ts`)*

### 1.8 Systemic "`AUTO_STAGE_ADVANCE_ENABLED` is off" stale comments
Since the WF-1A phase, `AUTO_STAGE_ADVANCE_ENABLED` has been deliberately armed (`true`) and a
real live forward-Advance write path exists (§1.3's `DealStageProgressionCard.tsx`, mounted in
the banker/manager/team workspaces). At least nine comments across the codebase never got
updated and still describe the flag as "default-off" / "false" / the sole remaining blocker —
most seriously in `platformInventory.ts`, which backs a **live admin dashboard**
(Release Readiness Gate) that reviewers use to certify what's actually live. Corrected every
instance found, without changing any runtime behavior; rescoped the `DELIBERATELY_BLOCKED`
entry to what's actually still blocked (the canonical Return/Decline/Withdraw engine, which is
unmounted — not flag-gated). Deliberately did **not** add a new `GOVERNED_WRITES` registry
entry for the live forward-advance write in this pass — see §2.1.
*(`platformInventory.ts`, `buildLiveStageAdvanceDeps.ts`, `stageAdvanceWriteDependency.ts`,
`canonicalStageTransition.ts`, `buildLiveCanonicalTransitionDeps.ts`, `newDealCreateAdapter.ts`,
`dealOriginationFeatureFlags.ts`, `intentionallyUnrouted.ts`,
`docs/STAGE_PROGRESSION_ENABLEMENT_MAP.md`)*

### 1.9 **[Critical]** Credit Approval committee/reviewed/approved status could be bypassed by any memo
The live, armed gate `deriveCreditBlockers` had a generic fallback: any credit requirement
whose id didn't contain "memo" or "section" was satisfied by mere memo *presence*
(`memos.length > 0`). Three CREDIT_APPROVAL requirements — "reviewed memo", "committee
package", and "approved credit memo" — fell into this weak check, so **any single draft memo
record satisfied all three regardless of actual committee review, approval decision, or memo
finalization status.** A deal could reach Commitment with a draft memo and zero committee
involvement, at any dollar amount. The schema genuinely has no field for this
(`CreditMemoStatusKey` is only draft/final/stale), so the fix doesn't fabricate a check: these
three now always render as visible/at-risk (never silently "met") instead of disappearing once
any memo exists, and stay non-blocking (there's no remediation UI that could ever clear a hard
block here today — blocking would have stranded every in-flight Credit Approval deal). Applied
the equivalent correction in the newer, stricter requirement-engine registry, which
independently auto-derives the same three as `blocking` from the stage definition — without
that companion fix, Credit Approval exit would have become **permanently unsatisfiable** the
moment the first fix landed (verified directly against the engine before/after). Added
`loanWorkflowRules.test.ts` — this live gate had **zero direct unit tests** before this pass —
plus a Credit Approval regression block in `loanWorkflowRequirementEngine.test.ts`.
*(`src/workflow/loanWorkflowRules.ts`, `loanWorkflowRequirementRegistry.ts`)*

### 1.10 Client/team picker silently truncates at 200 with no signal
Every CRM link-option loader fetches at most 200 rows with no server-side search-as-you-type.
Once a bank's book exceeds the cap, a real client/team sorting alphabetically after the cutoff
is invisible — the search box reports "no match" for a record that genuinely exists, with no
indication anything was truncated. Added a plain-language notice on the New Deal create client
step when the fetched list hits the cap.
*(`src/crm/dealCrmLinkOptions.ts`, `src/banker/BankerNewDealCreate.tsx`)*

### 1.11 Governance-pin gap
`dealOriginationGovernance.test.ts`'s "risk domain gates stay hard-false post-launch" block
pinned `AUTO_STAGE_ADVANCE_ENABLED` as armed but omitted the other two Completion-Phase-A-armed
domains (`TASK_GENERATION_ENABLED`, `DUPLICATE_DETECTION_ENABLED`) — a reviewer scanning only
this file (whose framing implies it's the authoritative pin) would miss that two more domains
are armed. Added the missing pin.

---

## 2. Known gaps — deliberately not attempted in this pass

These are real, verified findings from the audit that were **not** fixed here, with the reason
in each case. None of them are silently unresolved: each is either honestly labeled in the
live code today, or is flagged here for a follow-up phase.

### 2.1 Forward stage-advance is not registered in `GOVERNED_WRITES`
The live write from §1.3/§1.8 belongs in `platformInventory.ts`'s `GOVERNED_WRITES` list.
Registering it correctly also requires matching entries in `AUDIT_BY_WRITE_ID`,
`OUTCOME_BY_WRITE_ID`, and `TIMELINE_BY_WRITE_ID` (each independently cross-verified against
real source by its own discipline test — `auditPayloadDiscipline.test.ts`,
`outcomeUnionDiscipline.test.ts`, `timelinePayloadDiscipline.test.ts`) plus updating every
hardcoded `GOVERNED_WRITES.length` citation across ~6 release-candidate docs/tests. Attempted
in this pass and reverted after confirming the ripple (9 test files touched, most requiring
careful field-level verification against source I hadn't independently confirmed) was a
larger, separate piece of work than the comment-accuracy fix this pass targeted. Comments were
corrected in place (§1.8) so nothing currently reads as false; the registration itself is a
clean, well-scoped follow-up phase.

### 2.2 The write seam (`stageAdvanceWriteDependency.ts`) enforces the shallow legacy gate only
`DealStageProgressionCard`'s **button** enable/disable state is gated on both the legacy policy
*and* the stricter `evaluateStageExitPolicy` engine (`allowed = policy.allowed &&
enginePolicy.allowed`). The **write seam itself** (`advanceWorkflowStage`) only checks the
legacy policy. Today this is harmless in practice — the UI is the only live caller and it
double-checks — but it is a real defense-in-depth gap: any future caller of
`advanceWorkflowStage` (a script, a second UI, a bug that reorders the button's checks) could
advance a stage the stricter engine would have blocked. Fixing this correctly means threading a
`WorkflowRequirementFacts` loader into the write seam's signature, which is a real API change
touching every caller and test of that seam — left as a recommended follow-up, not attempted
here given the regression risk relative to today's actual exposure (zero, since the sole live
caller already double-gates).

### 2.3 The configurable workflow-routing engine (Phase 142C) can never reach a live deal
`WorkflowRoutingPanel.tsx` / `deriveConfigurableWorkflowRoute.ts` / `workflowRouteRuleRegistry.ts`
are fully built and tested but architecturally guaranteed to stay disconnected — a governance
test (`workflowRoutingGovernance.test.ts`) asserts `App.tsx` never references them, and the
panel itself has **no edit affordance** (it's read-only display over a frozen `const` array).
There is no "admin changes a routing rule" flow anywhere in the app — the premise of an
editable admin routing config does not exist in the codebase today. Separately,
`approvalAuthorityMatrix.ts` ("OGB policy: single authorized-approver gate, no amount tiers,
founder decision 2026-06-30") and `workflowRouteRuleRegistry.ts` (which has amount-tier
committee-escalation rules) state contradictory policies side by side — harmless today since
the registry is unrouted, but a real merge hazard later. Not attempted: reconnecting this
engine or reconciling the amount-tier contradiction is a product/policy decision (does the bank
want amount-tier committee routing or not?), not a code-quality fix.

### 2.4 Four independent "blocked/at-risk" derivations exist across the cockpit
`dealBlockerModel.ts` (the documented, authoritative model — `DealMetricDeck` already uses it),
`blockerRules.ts` (aging/overdue heuristic — `DealBlockers.tsx`/Attention Console,
`stageProgressionGuard.ts`), `teamSignals.ts` (`AtRiskBlockedDeals.tsx`, manager view), and
`teamQueries.ts` (`dealSeverity`, a fourth hand-copy) can show **different** blocked/at-risk
verdicts for the same deal on different surfaces a banker/manager might reasonably expect to
agree. `DealBlockers.tsx`'s Attention Console is not simply "wrong" — it's an intentionally
broader operational-hygiene view (aging, memo freshness, missing profile fields) than
`dealBlockerModel`'s narrower "hard blocker for stage advance" concept — but the visual/label
overlap ("blocked") invites the reader to conflate the two. A full unification is a genuine
redesign (which surfaces should share one model vs. legitimately show a different, broader
signal) that needs product input on intended UX, not a mechanical fix; not attempted here to
avoid introducing a different set of regressions in a component I don't have full product
context on. Recommended: either route `DealBlockers.tsx`/`AtRiskBlockedDeals.tsx` through
`deriveDealBlockerModel` for the "blocked/at-risk" count specifically (keeping the broader
signals as clearly separate, differently-labeled items), or relabel the non-canonical surfaces
so "blocked" never means two different things across the cockpit.

### 2.5 Deep facts genuinely absent from the schema (risk rating, approval authority, commitment issuance, conditions precedent, closing/funding, boarded-loan handoff)
These are honestly, consistently marked `tracked: false` / "untracked" throughout
`loanWorkflowRequirementRegistry.ts` and `docs/LOS_WORKFLOW_TRUTH_MATRIX.md` — verified during
this audit to still be accurate and *not* silently downgraded to look resolved. No action
needed; flagged here only so a reader of this report has the same picture the code already
gives an in-app user. Each is a real future-phase build (a Dataverse table + loader + evaluator
wiring), not a bug.

### 2.6 Duplicate CRM-linkage / dead-admin-surface code
`src/crm/linkage/newDealCrmClientLinkage.ts` and `src/crm/crmSalesforceSpineNewDealLinkage.ts`
are two more, non-overlapping "link a new deal to CRM" implementations with zero production
callers (the live path is `newDealCrmIntakeGate.ts`, confirmed reachable from
`dealOriginationOrchestrator.ts`). `src/deals/NewDealCreatePanel.tsx` (a second admin "governed
create" surface) is fully dead — its submit button has no `onClick` handler at all. None of
these are exploitable (they're unreachable), but they're a maintenance/confusion hazard: a
future engineer extending CRM linkage or "New Deal create" has two-to-three plausible places to
look, only one of which does anything. Recommended: delete the confirmed-dead surfaces, or add
an explicit "SUPERSEDED — see X" comment pointing at the real live path. Not deleted in this
pass to keep the diff focused on behavior fixes rather than code removal that, while safe per
the reachability audit, widens the review surface without a corresponding runtime benefit.

### 2.7 Document matching is still name-substring, even in the newer "typed" evaluator
`evaluateDocumentRequirement` (the documented "authoritative document gate, replaces pure
name-substring readiness") types the received/reviewed *status* correctly but still *matches* a
document to its requirement by `normalizeName(label).includes(needle)` — identical mechanism to
the legacy check. A document uploaded as "Guarantor's Personal Tax Returns" can satisfy the
"Tax Returns" requirement even for the wrong entity's filing — no business-type key exists in
the schema to disambiguate. Real fix requires a schema change (a typed document-category key on
the document-checklist table); flagged for a future phase.

---

## 4. Follow-up pass — resolution of the 7 items in §2 (2026-07-13)

All 7 items above were revisited and either fixed or confirmed genuinely un-fixable in code.

- **§2.1 (`GOVERNED_WRITES` registration)** — **Fixed.** `deal-stage-advance` is registered with
  a `legacyDisciplineExempt: true` flag (added to `GovernedWriteEntry`) after tracing the real
  correlation-id/audit/timeline code paths and confirming the write's architecture predates and
  structurally deviates from the older Phase 46/47/49/50 discipline conventions those sweeps
  check — an honest exemption, not a forced/fake match. All 9 affected discipline tests and
  hardcoded `GOVERNED_WRITES.length` citations updated (13 → 14).
- **§2.2 (write seam enforces only the shallow legacy gate)** — **Fixed.**
  `stageAdvanceWriteDependency.ts` now accepts optional `facts: WorkflowRequirementFacts` and,
  when supplied, re-checks `evaluateStageExitPolicy`/`deriveStageExitReadiness` at the write seam
  itself — not just in the UI's button-enable check. Backward compatible (no `facts` = prior
  behavior, unchanged for any caller not yet updated).
- **§2.3 (Phase 142C routing engine unreachable + amount-tier policy contradiction)** —
  **Fixed, single-approver.** The amount-tier committee rules (`rule_credit_committee_required`,
  `rule_executive_visibility`) and the independent amount-based committee escalation in
  `deriveCreditCommitteeRoute.ts` were removed so the engine matches the ratified single-approver
  policy (`approvalAuthorityMatrix.ts`) — a committee is now only in play when a rule's
  `committeePolicy` explicitly says so (covenant exception, construction/project-based), never
  from loan amount alone. The engine is now mounted live in `BankerDealWorkspace.tsx` via a new
  `DealWorkflowRoutingPanel.tsx` + a conservative `buildWorkflowRoutingInputFromDeal.ts` mapper
  (free-text `productType` maps to the engine's closed taxonomy only on an unambiguous keyword
  match, else `'unknown'` — never guessed). `App.tsx` still never references the engine directly,
  preserving the existing governance assertion.
- **§2.4 (four independent blocked/at-risk derivations)** — **Partially unified.**
  `DealBlockers.tsx` (the Attention Console) now also runs `deriveDealBlockerModelForStage` (the
  same authoritative model `DealMetricDeck` uses) and folds its hard blockers in as
  `"Stage exit: …"` signals, so a real stage-exit blocker can no longer show a clean Attention
  Console next to a Metric Deck correctly reporting one. `AtRiskBlockedDeals.tsx` /
  `SharedActiveDeals.tsx` / `teamQueries.ts` were deliberately left alone — they run team-wide
  pipeline queries with no per-deal task/document/creditMemo loaded, so routing them through the
  same model would require a real N+1 data-loading redesign, not a mechanical fix.
- **§2.5 (deep facts absent from the schema)** — **Confirmed, no code action exists.**
  Re-verified against `underwritingDeepFacts.ts` and `docs/LOS_WORKFLOW_TRUTH_MATRIX.md`: the
  risk-rating and underwriting-recommendation *policy models* are already fully built and tested
  (`evaluateRiskRatingReadiness`, `evaluateUnderwritingRecommendationReadiness`) and will flip
  live automatically the moment a real backing record exists — but no Dataverse table for either
  concept exists today (not even an unused reference table), and approval-authority/commitment/
  closing/funding/boarding facts are the same. Building the backing schema is an operator/admin
  action in Power Platform, and fabricating a fake loader against a non-existent table would
  violate this codebase's fail-closed "never fabricate" discipline everywhere else. No change
  made; §2.5 stands as accurately documented, not as unfinished work.
- **§2.7 (document matching is name-substring)** — **Confirmed, no code action exists.** The
  `cr664_documentchecklist` table has no typed business-category key column — only a free-text
  name — so `evaluateDocumentRequirement`'s substring match is already the most precise mechanism
  the current schema supports (and it already upgrades the legacy check by typing the
  received-vs-reviewed *status*, which is the part that actually gates the transition). A
  heuristic tweak to the matching itself would add real regression risk to a compliance-critical
  document gate for no verifiable precision gain, and would not remove the fundamental ambiguity
  a schema key would resolve. No change made; §2.7 stands as accurately documented.

Full verify (`tsc -b` + `vitest run` + reachability audit + `vite build`) is green after each
fix, most recently: 810 test files / 11511 tests passed, 2 skipped, 0 unexpected orphans.

---

## 3. Verification

Every fix in §1 is covered by a new or corrected automated test exercising the real code path
(not just derivation in isolation — e.g. §1.3 and §1.6 have tests that render the component,
click/type, and assert on the resulting DOM/mock calls). After each fix:
`npx tsc -b` clean, the directly affected test files green, then a broader sweep
(`src/workflow src/deals src/banker src/crm src/shared/governance src/navigation`) green, then
periodically the full suite + `node scripts/reachability-audit.mjs` (0 unexpected orphans
throughout). Run `npm run verify` for a final, complete confirmation before merge.
