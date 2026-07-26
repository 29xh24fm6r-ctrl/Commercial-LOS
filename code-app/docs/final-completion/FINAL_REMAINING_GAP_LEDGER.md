# Final Remaining Gap Ledger

## Purpose and rules

This ledger is Workstream A of the "Final LOS Completion" arc and is written **before** any
further implementation in this arc, per the arc's own required-first-response discipline. It
inventories every `untracked()` workflow requirement, in-memory fallback, feature flag, schema
bridge, generated-service stand-in, document vocabulary, capability/readiness panel, write path
missing a timeline event, operator migration, connector dependency, and security-role dependency
found by direct investigation of the current `master` (merged through PR #144, commit `18aae1b`).

Every row is sourced from an actual file/line read in this session, not inferred from a prior
document's summary. Where a prior document already covers a topic accurately, this ledger cites it
rather than re-deriving it, per the same non-duplication discipline used in the deployment/
certification package (PR B).

## 1. `untracked()` workflow requirements (`src/workflow/loanWorkflowRequirementRegistry.ts`)

| Line | Requirement id | Backing record needed | Status after investigation |
|---|---|---|---|
| 236 | `CREDIT_APPROVAL:memo_finalized` | Credit memo finalization status | No durable status field distinct from memo content existing today |
| 237 | `CREDIT_APPROVAL:approval_decision` | Credit Approval record | **Does not exist** — no `cr664_creditapproval*` table |
| 238 | `CREDIT_APPROVAL:approval_authority` | Approval authority computation | `creditApprovalAuthority.ts` is a pure check, not a persisted record |
| 239 | `CREDIT_APPROVAL:approval_conditions` | Approval conditions record | Does not exist |
| 241 | `COMMITMENT:commitment_issued` | Commitment record | **Does not exist** — no `cr664_commitment*` table |
| 242 | `COMMITMENT:borrower_acceptance` | Commitment acceptance record | Does not exist |
| 244 | `DOCUMENTATION:conditions_precedent` | Conditions Precedent record | **Does not exist.** `DealFundingAuthorizationPanel.tsx:42-51` hard-codes `conditionsPrecedentResolved: false` specifically because no source exists |
| 245 | `DOCUMENTATION:collateral_verified` | Pre-closing collateral verification | Post-boarding collateral tables exist (`cr664_portfolioboardedloancollaterals`) but nothing pre-closing |
| 246 | `DOCUMENTATION:insurance_verified` | Pre-closing insurance verification | Same gap as above (`cr664_portfolioboardedloaninsurances` is post-boarding only) |
| 248 | `CLOSING_FUNDING:executed_docs` | Executed-document certification | Closing generation exists (manifests) but nothing distinguishes "generated" from "executed/signed" |
| 255 | `CLOSING_FUNDING:booking_qc` | Booking QC record | **Does not exist** |
| 257 | `BOARDED:boarded_loan_record` | Boarded loan as source of truth | Boarding writes are real and live (`buildLiveStageAdvanceDeps.ts` `onDealBoarded`) but not yet the registry's source of truth |
| 258 | `BOARDED:servicing_owner` | Servicing owner assignment | Not tracked anywhere |
| 306 | `RETURN:authorization` | Return authorization tier | Only identity resolution exists, no tiered authority. **Workstream J: stays untracked by design** — governance contract §5 explicitly rules out inventing a new tier for this initiative; see §14. |
| 308 | `DECLINE:adverse_action` | Adverse action workflow | **Closed by Workstream J** — durable Adverse Action Record now tracks completion (SENT/WAIVED); see §14. |

Already `tracked()` and **not to be rebuilt**: `UNDERWRITING:risk_rating` (233), `UNDERWRITING:uw_recommendation` (234), `CLOSING_FUNDING:funds_disbursed` (254).

## 2. In-memory / non-durable fallbacks

| Location | What's in-memory | Durable replacement needed |
|---|---|---|
| `src/deals/DealFundingAuthorizationPanel.tsx:42-51` | `conditionsPrecedentResolved: false` hard-coded | Conditions Precedent durable record (Workstream E) |
| `src/closing/documents/closingDocumentStorage.ts` `createInMemoryClosingDocumentStore()` | Non-durable test/dev fallback | Already has a real Dataverse counterpart (`createDataverseClosingDocumentStore()`); the in-memory store is intentionally kept as a test double, not a production path — no action needed |
| Credit approval readiness | `CreditApprovalReadinessPanel.tsx` derives a read-only projection from tasks/documents/memo, never a persisted decision | Credit Approval durable record (Workstream C) |

## 3. Feature flags / gated adapters

| Location | Gate | Notes |
|---|---|---|
| `src/portfolioBoarding/portfolioLoanBoardingDataverseAdapter.ts:1-4,32-46` | "disabled by default" | Base adapter for the manual Portfolio Loan Boarding workspace; the auto-boarding path (`onDealBoarded`) is unconditional and does not use this gate — two different boarding paths with different flag postures, documented here so a future reader doesn't conflate them |
| `src/portfolioBoarding/resolvePortfolioLoanBoardingPersistenceAdapter.ts` | fails closed unless flags + authorized operator + injected client + verified schema all pass | Working as intended; no defect |

## 4. Schema bridges / generated-service stand-ins (hand-authored, not `pac`-regenerated)

Every one of these carries its own disclosure header already; listed here only for completeness:
`Cr664_closingdocumentmanifestsModel.ts`/`Service.ts` (PR A), `Cr664_fundingauthorizationsModel.ts`/`Service.ts` (PR112). Both require the operator to run `pac code add-data-source` against a live table before the hand-authored stand-in can be safely replaced — see `02_SCHEMA_VERIFICATION_AND_DEPLOYMENT_COMMANDS.md` for the exact commands already documented for these two.

Any new entity this arc adds (Credit Approval, Commitment, Conditions Precedent, Booking QC) will follow the exact same disclosed-stand-in pattern.

## 5. Document vocabulary / taxonomy fragmentation

Confirmed by direct investigation (matches the codebase's own prior self-audit in
`docs/production-remediation/N11_DOCUMENT_TAXONOMY_MAP.md` and `PR134_DOCUMENT_TAXONOMY_NORMALIZATION.md`,
which this ledger does not repeat in full):

1. Document Requirements panel (`documentRequirementDerivation.ts`) — key + display-name, exact-normalized-string match.
2. Stage Map / gate engine (`loanWorkflowStages.ts`) — free-text label, **substring `.includes()` match**. Confirmed live divergence: `"business tax returns".includes("tax returns")` is true, so the panel (#1) and the gate engine (#2) can disagree about whether two named documents are the same requirement.
3. Closing document generation (`closingDocumentTemplateRegistry.ts`) — typed key, legitimately a different universe (internal artifacts, not borrower-supplied).
4. Retired pilot list (`documentChecklistPilotConfig.ts`) — dead, display-only.
5. Portfolio Boarding (`portfolioLoanBoardingTypes.ts`) — **43-key** typed enum (this ledger's earlier "39" was a stale count from an earlier revision of that file — corrected by Workstream B's direct line-by-line recount), cleanest of the six.
6. Annual Review (`annualReviewTypes.ts`) — 13-key typed enum, independently declared, spelling drift against #5 (`financial_statements` vs `annual_financial_statements`).
7. Product/Process templates (`productProcessTemplateRegistry.ts`) — loose `string`, guidance-only (not a live gate), partial overlap/drift against #5/#6.

**Closed by Workstream B:** `src/shared/deals/canonicalDocumentTaxonomy.ts` introduces one additive
canonical 20-key borrower-document taxonomy with legacy-alias mapping, wired to the two typed-enum
consumers (#5, #6) via `canonicalDocumentKeyForAnnualReviewType()` /
`canonicalDocumentKeyForPortfolioBoardingType()` — pure, IO-free, no live-gate behavior touched.
Proves the confirmed `financial_statements`/`annual_financial_statements` drift now resolves to the
same canonical key (`business_financial_statements`), via a passing regression test. A disclosed
scoping call excludes Portfolio Boarding's lender-internal/governance/servicing/legal-instrument keys
(14+ of the 43 — see `PORTFOLIO_BOARDING_OUT_OF_SCOPE` in the module) from the borrower-document
taxonomy entirely, since forcing them in would misrepresent internal artifacts as borrower-collectible
documents; five of the 20 canonical keys are themselves a disclosed compression of multiple distinct
documents (see the module's own header for the full list); and the undifferentiated `tax_returns`
value in both source systems is resolved to `business_tax_returns` by an explicit, documented policy
convention, not a derived fact.

Given six independently-matching consumers with **different match semantics** (exact vs. substring vs.
typed enum), a single-PR rip-and-replace of all six risks silently changing which documents satisfy
which gates in production. Consumers using substring-match gating (#1's exact-match reconciliation,
#2's substring-match stage gate — both LIVE and write-seam-gating) are deliberately NOT touched in
this workstream — flagged here for a separate, reviewed cutover rather than folded silently into this
arc, in keeping with the anti-fabrication discipline this arc requires. #3 (a genuinely different,
internal-artifact universe), #4 (confirmed dead/retired), and #7 (confirmed unrouted, non-gating) are
also left untouched — there is nothing live to wire for any of the three.

## 6. Capability / readiness panel fragmentation (Admin)

Nine separate panels mounted in `AdminWorkspace.tsx`, each with its own status vocabulary — see the
required-first-response report (item 9) for the full enum list. `AdminCapabilityTruthMatrix` only
cross-references `platformInventory.ts`'s four registries (`GOVERNED_WRITES`, `NOT_WIRED`,
`LOCAL_ONLY_FLOWS`, `DELIBERATELY_BLOCKED`), not the other 8 panels' native enums. This is
deliberate/additive by prior design (documented in the file's own comments), not an oversight this
arc introduced — Workstream M adds one new authoritative model without retiring the existing nine.

## 7. Write paths lacking a timeline event

Full table already produced in the required-first-response report (item 8); repeated here as the
authoritative source list for Workstream K:

- **Missing entirely:** risk rating assigned/finalized, UW recommendation finalized, commitment issued/accepted, condition satisfied/waived, closing document generated, executed document verified, booking QC completed, boarded-loan-created (dedicated event — only a generic `StageChanged` fires today), servicing-owner-assigned. (Adverse action is now closed — see §13.)
- **Built but not wired (payload shape only):** funding requested/first-approval/second-approval/rejected/revoked — `fundingTimeline.ts` explicitly documents this as "not wired... no dedicated event type exists on the schema yet."
- **CORRECTION (Workstream J):** the row this table previously carried here — "wired but dead code (unmounted UI): credit-approval decline, return authorization... `StageWorkflowControl.tsx is not mounted`" — was stale by the time this arc reached Workstream J. `DealGovernedTransitionPanel.tsx` mounts `StageWorkflowControl` in `BankerDealWorkspace.tsx` (task #16 of this arc's own tracker, completed earlier) with `liveEnabled` set, so RETURN/DECLINE/WITHDRAW ARE live and reachable today, and their audit/timeline writes through `buildLiveCanonicalTransitionDeps.ts` fire on a real user action, not dead code. The two stale doc-comments making this claim (`canonicalStageTransition.ts`, `buildLiveCanonicalTransitionDeps.ts`) were corrected in the same commit as this ledger update.
- **Working today:** document requested/uploaded/reviewed, generic stage-change, note-logging.

## 8. Test-record classification gaps (N-17 follow-on)

- Manager (`managerQueries.ts:203-239`) and Team (`teamQueries.ts:188-224`): call the governed
  `isTestOrSmokeDeal` helper but never select/map `cr664_istestrecord` — silently degrade to
  name-only matching. **This is a real, fixable bug**, not a scope gap, and is the first concrete
  fix this arc makes (see commit sequence).
- Admin `TestDataView` (`adminTestDataQueries.ts:31-44`): same bug — its own `select` list omits
  the column it exists to report on.
- Executive: name-only by explicit design (not a bug).
- Portfolio, Portfolio Boarding, CRM, Closing, Workflow, Committee: no classification of any kind.

## 9. Safe-error-mapper gaps

Approximately 19 write-path files identified with unmapped raw-error branches (full list in the
required-first-response report, item 11) — `documentActions.ts`, `dealTaskActions.ts`,
`createDealTaskAction.ts`, `creditMemoActions.ts`, `logActivityActions.ts`,
`sendBorrowerUpdateEmail.ts`, `prepareDocumentRequestHandoff.ts`, `sendDocumentRequestEmail.ts`,
`addRequiredDocumentAction.ts`, `newDealCreateAdapter.ts`, `crmUpdateAdapter.ts`,
`dealIndustryProjection.ts`, `existingLoanEntryAdapter.ts`,
`portfolioLoanBoardingDataverseWriteClient.ts`, `portfolioSharePointDocumentAdapters.ts`,
`closingDocumentStorage.ts`, `closingDocumentAudit.ts`, `bridgeOrgToClientRelationship.ts`,
`createClientRelationship.ts`. A larger, separate **read-path** leak (~20 files, load-failure
banners) is documented honestly here as **out of scope for this arc's write-path-focused pass** —
noted so it is not silently dropped, and left as a follow-on item.

## 10. Reused-not-rebuilt: Data Quality Flags (Workstream O)

`cr664_dataqualityflags` **already exists and is already wired** (`src/admin/DataQualityFlags.tsx`,
`dataQualityActions.ts`, `AdminDataProvider.tsx`), with flag types `StaleSnapshot, OrphanRecord,
BrokenReference, MissingOwner, InvalidValue, ASSIGNMENT_MISMATCH`. Workstream O's required
categories (duplicate borrower/company/deal, near-duplicate names, suspicious active deals,
zero-amount deals, duplicate entitlements, inconsistent boarding linkage) are **not yet covered** by
these six flag types or by any detection rule. This arc will add detection rules and, if needed,
additive flag-type values — it will **not** create a new entity, since one already exists.

## 11. Operator migrations already documented (not duplicated here)

`docs/production-remediation/deployment-and-live-certification/01_MIGRATION_RUNBOOK.md` already
covers the 4 outstanding PR A/B migrations (document requirement lifecycle, CRM industry
projection, test-record field, closing document manifest). This arc's new schema (Credit Approval,
Commitment, Conditions Precedent, Booking QC, timeline/flag option-set additions) will get its own
migration scripts following the exact same script/verify/rollback shape, added to that same
directory structure rather than a duplicate one.

## 12. Connector / security-role dependencies

- SharePoint document-storage connector activation (`docs/PHASE_264_SHAREPOINT_DOCUMENT_STORAGE.md`) — unchanged by this arc, still an external operator dependency for any workstream touching document upload.
- Dataverse governance plugin (`dataverse-plugins/CommercialLendingLOS.Plugins/`) — Workstream T's server-side segregation control, if added in this arc, requires build + registration in the live environment, which is an operator action this arc cannot perform.
- Any new Dataverse table requires a security-role/column-level-security review before go-live — flagged per new entity as it is added, not assumed away.

## 13. Workstream I — Portfolio ownership / servicing readiness (investigated, blocked — no code shipped)

Investigated via direct code read (`src/workflow/loanWorkflowRequirementRegistry.ts`, `src/portfolioBoarding/*`, `src/servicing/*`, `src/deals/loadBoardingHandoffForDeal.ts`) plus this arc's own `docs/remediation/WORKSTREAM_K_PORTFOLIO_BOARDING_FIELD_GAP_2026-07-22.md` (§3) and `WORKSTREAM_IJ_CREDIT_CONTROLS_DEPENDENCY_REPORT_2026-07-22.md`, both pre-existing from an earlier remediation branch.

- No other `untracked()` registry entries relate to portfolio ownership or servicing readiness. The only entries left after Workstream H are `CREDIT_APPROVAL:memo_finalized`, `RETURN:authorization`, `DECLINE:adverse_action` — none of which are portfolio/servicing concepts (the latter two are Workstream J's actual target).
- No "servicing readiness checklist" concept (first-payment date, escrow, tickler configuration) exists anywhere in `src/servicing/*` or `Cr664_portfolioboardedloansModel.ts` as a gated requirement — nothing to wire.
- The one genuine gap: `cr664_PortfolioManager` (a `systemuser` lookup on `cr664_portfolioboardedloans`) is fully wired on the **manual** boarding path but is **never populated on the auto-board path**, because `DealDetail` carries only `bankerName` (a display string), not a `systemuser` id. `loadBoardingHandoffForDeal.ts` does not select `_cr664_portfoliomanager_value`, and no workflow requirement gates on it.
- **Why this was not coded:** closing it safely requires either (a) capturing a `systemuser`-typed relationship-manager field earlier in origination (the recommended fix, per `WORKSTREAM_K_PORTFOLIO_BOARDING_FIELD_GAP_2026-07-22.md`'s own recommended-next-step §2), or (b) a reviewed name-to-systemuser resolution service. Both are product/schema decisions requiring operator sign-off, not pure code fixes — attempting a heuristic name-match resolver risks silently binding the wrong operator's record to a live portfolio loan, a data-integrity/security-adjacent risk this arc's guardrails forbid taking unilaterally.
- **Disposition:** deferred, documented honestly, no placeholder/fabricated resolution introduced. Flagged for the same operator decision already tracked against Workstream K/I-J's shared risk-rating gap.

## 14. Workstream J — Return authorization + adverse action durable records

Targeted the registry's two remaining post-Workstream-H `untracked()` entries: `RETURN:authorization`
(line 338 as of Workstream A) and `DECLINE:adverse_action` (line 340). Investigated via direct read of
`docs/governance/CANONICAL_TRANSITION_POLICY_CONTRACT.md` §3.2/§3.3/§5, `canonicalStageTransition.ts`,
and `loanWorkflowRequirementEngine.ts`'s `deriveTransitionReadiness` (the sole consumer of both
entries).

- **`RETURN:authorization` — stays untracked, on purpose, not a gap.** The contract's §5 explicitly
  ratifies "identity resolution is the whole requirement" for RETURN and states in so many words that
  inventing a distinct return-authority tier "is explicitly out of scope for this initiative and left
  for a future, separately-ratified revision." Flipping this to `tracked: true` would mean this arc
  unilaterally deciding a new governance policy the contract deliberately deferred — the same kind of
  overreach this arc's guardrails forbid elsewhere (e.g. Workstream I/J's credit-controls dependency
  report declining to invent an exception/override mechanism). No code change made; disposition is
  "correctly and deliberately not built," not "missing."
- **`DECLINE:adverse_action` — closed for real.** Built a durable, append-only Adverse Action Record
  (`cr664_adverseactionrecord`, `adverseActionRecordTypes.ts` / `adverseActionRecordStore.ts` /
  `submitAdverseActionAction.ts` / `DealAdverseActionPanel(Connected).tsx`, mounted in
  `BankerDealWorkspace.tsx`, visible only when the deal's status is DECLINED) that lets a credit
  officer document that the notification/documentation obligation `canonicalStageTransition.ts`
  already flags on every DECLINE (`adverseActionPending: true`) was completed (SENT) or waived. Flipped
  the registry entry `tracked: true` and wired `evaluateAdverseActionReadiness` into
  `deriveTransitionReadiness`'s per-item loop, gated on `currentStatus === 'DECLINED'` (the obligation
  can only be documented once a decline has actually happened; pre-decline it correctly stays `unmet`,
  never fabricated as `met`). Severity stays `recommended` (non-blocking) via the existing
  `NON_FORWARD_SEVERITY_OVERRIDE` — a DECLINE is a terminal action already; this item informs a
  compliance reviewer, it does not (and per the contract, should not) gate anything.
  Deliberately does NOT define what an adverse-action notice must contain, when it must be sent, or
  who must receive it — that is a product/legal-policy decision out of scope for this arc (mirrors the
  Booking QC precedent tracking pass/fail/waive without defining QC criteria).
- **Correction found along the way:** `canonicalStageTransition.ts` and `buildLiveCanonicalTransitionDeps.ts`
  both carried a stale doc-comment claiming `StageWorkflowControl.tsx` was unmounted / RETURN-DECLINE-
  WITHDRAW were preview-only. That was true when originally written but stale by Workstream J — this
  arc's own tracker shows "Mount Return/Decline/Withdraw as first-class client workflows" (task #16)
  completed in an earlier PR, and `DealGovernedTransitionPanel.tsx` does mount the control live in
  `BankerDealWorkspace.tsx`. Both comments corrected in the same commit (see §7 above).

## Living-document note

This ledger will be updated (not replaced) as each workstream lands, so that by the time the PR
opens, every row above has one of: a commit reference (fixed in this arc), an explicit "deferred —
reason" note, or an "external operator action required" note. An empty or stale ledger at PR time
would be exactly the kind of unfinished-passed-off-as-done this arc exists to prevent.
