# PR 146 Gap Inventory — "factory/final-durable-workflow-completion"

Written before/alongside implementation, per the factory mission's required sequencing
("update the gap ledger BEFORE implementation"). Classifies every 146-A through 146-I workstream
using the mission's required taxonomy: `CODE_FIX` / `SCHEMA_FIX` / `SECURITY_FIX` /
`OPERATOR_ACTION` / `EXTERNAL_DEPENDENCY` / `VERIFIED_COMPLETE` / `ACCEPTED_LIMITATION`.

This is a living document for this PR's lifetime — each workstream's row is updated in place as
work completes; nothing here is deleted, only corrected, so the PR body can point at the final
state of this file rather than reconstructing history from commit messages.

## 146-A — Accept real PAC output

| Field | Value |
|---|---|
| Classification | **EXTERNAL_DEPENDENCY** (blocked on operator action, not code) |
| Code location | `src/generated/models/Cr664_{creditapprovaldecisions,commitmentrecords,conditionverifications,executeddocattestations,bookingqcchecks,adverseactionrecords}Model.ts`, matching `*Service.ts` files, `src/generated/index.ts` |
| Dataverse dependency | The six tables must actually exist live in `org3a57b8d4.crm.dynamics.com` and be registered as Code App datasources before `pac code add-data-source` can regenerate real bindings |
| Operational dependency | Operator (mpaller@oldglorybank.com) must run `pac code add-data-source` against the live env and push the regenerated files to this repo/branch |
| Test coverage | N/A until real files land — current files carry an explicit "hand-authored stand-in" disclosure header (unchanged this PR) |
| Live verification requirement | Byte-level diff review of the regenerated files once pushed, confirming multi-select fields are NOT silently dropped/regressed (the documented `cr664_loandeal` SDK regression history) |
| Owner | Operator (push required) / this session (review once pushed) |
| Status | **BLOCKED — awaiting operator push.** Confirmed via full remote branch/commit history scan: no live PAC regeneration has reached this repo. Everything else in PR 146 proceeds independently. |

## 146-B — Credit memo finalization durable workflow fact

| Field | Value |
|---|---|
| Classification | **VERIFIED_COMPLETE** (this PR) |
| Code location | `src/workflow/creditMemoFinalizationReadiness.ts` (new, pure evaluator), `src/deals/finalizeCreditMemoAction.ts` (new, governed write), `src/workflow/loanWorkflowRequirementRegistry.ts` (`CREDIT_APPROVAL:memo_finalized` flipped `tracked()`), `src/workflow/loanWorkflowRequirementEngine.ts` (new evaluator case), `src/deals/CreditMemo.tsx` (Finalize memo UI), `src/deals/DealDataProvider.tsx` (new `after-credit-memo-finalized` refresh key) |
| Dataverse dependency | None new — reuses the EXISTING `cr664_creditmemo1.cr664_status` field (draft/final/stale), already persisted by every memo save since `creditMemoActions.ts` |
| Operational dependency | None |
| Test coverage | `creditMemoFinalizationReadiness.test.ts` (7 tests), `finalizeCreditMemoAction.test.ts` (9 tests), `CreditMemo.test.tsx` (+4 new finalize-UI tests), `loanWorkflowRequirementEngine.test.ts` / `loanWorkflowRequirementRegistry.test.ts` updated to reflect the now-tracked fact |
| Live verification requirement | Deferred to PR 148's controlled E2E: finalize a real (test) memo, reload, confirm the Stage Map / Credit Approval exit gate reads the persisted Final status, not a cached client value |
| Owner | This session |
| Status | Done. "Current" memo = highest `cr664_version` (existing `creditMemoQueries.ts` convention), NOT the append-only supersedes-chain pattern the six Workstream C-H durable records use — deliberately not forced into that pattern since credit memos already had their own established versioning convention. |

## 146-C — RETURN:authorization disposition

| Field | Value |
|---|---|
| Classification | **ACCEPTED_LIMITATION** |
| Code location | `src/workflow/loanWorkflowRequirementRegistry.ts` line ~352 (`RETURN:authorization`, the one remaining `untracked()` entry in the whole registry after 146-B) |
| Dataverse dependency | None — no schema exists for a return-authorization tier, and none is being added |
| Operational dependency | None for this PR; a future authorization-tier design would need product/executive scoping |
| Concrete risk statement | Any actor who can resolve an identity (any authenticated banker/manager) can execute a RETURN transition on a deal, with no distinct authority tier gating WHO may return a deal to an earlier stage — unlike CREDIT_APPROVAL's committee/authority tiers or DECLINE's adverse-action obligation. A RETURN is reversible (the deal re-enters the earlier stage's normal exit gates) and is logged (timeline + audit), so the exposure is process/segregation-of-duties, not data-loss or unauthorized fund movement. |
| Test coverage | `loanWorkflowRequirementRegistry.test.ts`'s updated test explicitly pins `RETURN:authorization` as the registry's one remaining untracked deep fact, so a future accidental "fix" is visible in a diff, not silently reverted |
| Live verification requirement | N/A — this is a documented non-gate, not a capability to verify live |
| Executive approval path | This is a RE-CONFIRMATION of a decision already ratified in `docs/governance/CANONICAL_TRANSITION_POLICY_CONTRACT.md` §5 during the prior governance initiative (2026-07-21, pre-dating the Final LOS Completion arc) and re-confirmed by Workstream J. It is not being newly accepted here without executive sign-off — it is inheriting an existing, already-approved ratification. If a future initiative wants to add a return-authorization tier, that is new product scope requiring its own sign-off, not a gap this PR silently deferred. |
| Owner | Governance contract (already ratified) — no new owner needed this PR |
| Status | Confirmed unchanged. No code touched for 146-C beyond the registry test's updated pin (see 146-B's changes). |

## 146-D — Document taxonomy full cutover

| Field | Value |
|---|---|
| Classification | **CODE_FIX** (partial, low-risk items only) + **ACCEPTED_LIMITATION** (the vocabulary-authority decision) |
| Code location | Low-risk: `src/deals/documentRequirementLiveDeps.ts`'s `liveFindRowByName` (ad hoc inline normalize, 5th copy the N-11 consolidation missed). Higher-risk (not touched this PR): `src/deals/documentRequirementDerivation.ts` (exact-match reconciliation) vs. `src/workflow/loanWorkflowRequirementEngine.ts` / `loanWorkflowRules.ts` (substring `.includes()` stage gate) — two LIVE production paths with a proven real vocabulary disagreement ("Business Tax Returns" vs. "Tax returns") |
| Dataverse dependency | None for the low-risk fix. The higher-risk unification would need validation against live `cr664_documentchecklist` data before choosing an authoritative vocabulary — that validation cannot happen in this sandbox |
| Operational dependency | Deciding which of the two live vocabularies is authoritative is a schema/product decision requiring a human call, not a mechanical swap — deferred, not silently resolved |
| Test coverage | `documentRequirementLiveDeps.test.ts` — added a case proving the fix's actual behavior change (a dash/slash-punctuated document name now matches, which the prior ad hoc `.trim().toLowerCase()` would have missed) |
| Live verification requirement | Deferred — the two-vocabulary disagreement needs to be checked against real `cr664_documentchecklist` rows before any unification is attempted |
| Owner | This session (low-risk fix, done) / product+engineering jointly (vocabulary-authority decision, future) |
| Status | Low-risk normalize-consolidation fix applied and tested this PR. The two-vocabulary disagreement and `fundingReadiness.ts`'s hardcoded-`false` document-completeness fact are explicitly NOT touched here — attempting either mechanically risks silently changing which documents gate which stage, which the mission's "DO NOT weaken controls merely to make tests pass" constraint forbids doing without a deliberate, documented design decision. Remains an ACCEPTED_LIMITATION for this PR pending that decision. |

## 146-E — Servicing owner / portfolio manager durable assignment

| Field | Value |
|---|---|
| Classification | **VERIFIED_COMPLETE** (this PR) |
| Code location | `src/admin/assignServicingOwnerWrite.ts` (new, governed write + `searchServicingOwnerLoans`), `src/admin/AdminAssignServicingOwnerPanel.tsx` (new UI, mounted in `AdminWorkspace.tsx`), read side already at `src/workflow/boardingHandoffReadiness.ts` (`servicingOwnerAssigned`) |
| Dataverse dependency | None new — `cr664_AssignedServicingOwner` lookup (target `systemuser`) already exists on `cr664_portfolioboardedloan`, confirmed via `portfolioLoanBoardingDataverseSchemaPlan.ts` |
| Operational dependency | None |
| Test coverage | `assignServicingOwnerWrite.test.ts` (11 tests: fail-closed authorization/identity, no-op-reassignment rejection, readback-verified success, write-failed, readback-mismatch, audit-failed), `AdminAssignServicingOwnerPanel.test.tsx` (4 tests) |
| Live verification requirement | Deferred to PR 148 E2E — assign a servicing owner, reload, confirm `BOARDED:servicing_owner` flips met and the portfolio/admin/deal views show the resolved identity |
| Owner | This session |
| Status | Done. The picker reuses `portfolioManagerOptions.ts`'s EXISTING `loadPortfolioManagerOptions()` systemuser resolver (NOT `adminAccessGrantLookup.ts`'s `listGrantablePlatformUsers()`, whose `id` is a `cr664_platformuserid` — a different identity space that does not bind through `@odata.bind: /systemusers(...)`) — confirmed both `cr664_PortfolioManager` and `cr664_AssignedServicingOwner` target the same `systemuser` entity. Mirrors `portfolioLoanRemovalWrite.ts`'s injected-deps + readback-verification discipline: the write re-reads the row after the update and fails closed (`readback-mismatch`) if the field does not show the new owner, rather than assuming success. Mounted admin-only (no existing per-loan edit surface existed in the Portfolio workspace to hook into) — a future phase could move this to a portfolio-manager-facing surface, but the durable fact and its governed write path are real and complete. |

## 146-F — Reconciliation durability (exception record model)

| Field | Value |
|---|---|
| Classification | **ACCEPTED_LIMITATION** (full generalization) + **CODE_FIX** (targeted extension, if attempted this PR) |
| Code location | `src/portfolio/reconciliation/bookReconciliation.ts` (`MigrationReconciliation` — a whole-batch verdict, not a per-exception record), `src/admin/dataQuality/dataQualityFlagCandidates.ts` / `cr664_dataqualityflags` (closest existing analog, but its 6-value `cr664_flagtype` enum has no duplicate/reconciliation values and no severity/measured-value/resolvedBy/resolvedAt/correlationId fields) |
| Dataverse dependency | A genuine generalization needs new columns on `cr664_dataqualityflags` (severity, measured-value/difference numerics, a real deal/loan lookup, resolvedBy/resolvedAt, a flag-level correlationId) or a new table — either is schema work requiring live provisioning, which is not something this sandbox can do without the operator |
| Operational dependency | Schema change (new columns or new table) requires operator-run migration + publish |
| Concrete risk statement | Today, neither `MigrationReconciliation`'s tie-out verdict nor `cr664_dataqualityflags`'s duplicate-detection findings block any workflow step — an unresolved reconciliation exception or an open duplicate-data flag has zero effect on boarding/funding/stage-advance. This is a real, disclosed gap versus the mission's "an unresolved material exception blocks any workflow step that depends on reconciliation" ask. |
| Test coverage | Existing engine/flag tests unchanged; no new blocking-gate tests exist because no blocking gate exists |
| Live verification requirement | N/A until the schema work lands |
| Executive approval path | Standing as ACCEPTED_LIMITATION for this PR — building a new exception-record schema live, in a single PR, without an operator round-trip to provision it, would either be schema work this session cannot verify live (violates "DO NOT claim live persistence without exact record readback") or a speculative table nobody has approved. Flagged here for explicit executive/product sign-off on which path (extend `cr664_dataqualityflags` vs. new table) before PR 147/148 schema work proceeds. |
| Owner | Product/schema owner (approval), then this session or a follow-on PR (implementation) |
| Status | Investigated in full (see research agent findings above); no schema change attempted this PR pending sign-off. |

## 146-G — Read-path safe-error completion sweep

| Field | Value |
|---|---|
| Classification | **CODE_FIX** (partial — 3 of ~20 file-pairs closed via the highest-leverage chokepoints) |
| Code location | Added `mapBusinessSafeReadError()` (`src/shared/errors/businessSafeErrorMapping.ts`) — the read-path sibling of the existing write-path `mapBusinessSafeError()` (that one's "We couldn't save that action" copy is actively wrong for a load failure). Applied at the single `bind()`/`.catch()` chokepoint in `ManagerDataProvider.tsx` and `TeamDataProvider.tsx` (each fans out to ~10 downstream cards in one fix) and both catches in `BankerProvider.tsx` (the whole-workspace gate AND the `writeDisabledReason` reason text rendered in "Save disabled: {reason}" banners across many panels). |
| Dataverse dependency | None |
| Operational dependency | None |
| Test coverage | `businessSafeErrorMapping.test.ts` — 4 new tests for `mapBusinessSafeReadError` (never renders raw text, uses read-appropriate copy, preserves technicalDetail, correlation-id fallback). Full `src/manager`, `src/team`, `src/banker` suites re-run clean (885 tests) confirming no consumer pinned the old raw-message behavior. |
| Live verification requirement | None required — pure client-side string-mapping fix, verifiable by unit test |
| Owner | This session |
| Status | Partial, honestly incomplete. Root cause confirmed: the prior safe-error audit (Workstream P) was scoped only to write actions; the read/list/loader side was never generalized (~20 file-pairs across `manager/`, `team/`, `banker/`, `executive/`, `deals/`, `admin/`, `crm/`, `portfolioBoarding/` per this PR's research). This pass closed the 3 highest-leverage Provider-level chokepoints (manager, team, banker — collectively covering roughly a dozen downstream components). NOT yet fixed: `executive/snapshotQueries.ts` + `operationalFallbackQueries.ts`, `deals/dealQueries.ts` / `dealTaskQueries.ts` / `dealDocumentQueries.ts` / `activityQueries.ts` / `creditMemoQueries.ts` / `documentRequirementLiveReader.ts` / `stageProgressionAvailabilityLoader.ts`, `portfolioBoarding/boardedLoansList.ts`, `admin/adminDiagnosticsQueries.ts` / `adminUserAccessQueries.ts` / `dealReferenceAdminQueries.ts` / `workspaceEntitlementWrite.ts` / `loadDataQualityScanInputs.ts` / `TestDataView.tsx` / `NewDealResolverReadinessCard.tsx` / `EmailLiveDiagnostics.tsx`, and `crm/` (`CrmIntelligencePanel.tsx`, `NaicsTypeahead.tsx`, `CrmOrgFieldInlineEdit.tsx`). Explicitly not silently deferred — tracked here as the remaining scope for a follow-on pass. |

## 146-H — Stage-gate reload proof

| Field | Value |
|---|---|
| Classification | **CODE_FIX** (new automated proof for the client-side reload mechanism) + **EXTERNAL_DEPENDENCY** (live, real-Dataverse readback proof, blocked with 146-A) |
| Code location | New `src/deals/DealDataProvider.reloadProof.test.tsx` — mounts the REAL `DealDataProvider`, mocks only the SDK-touching loaders, and proves `refresh(key)` genuinely re-invokes the loader and the context value reflects the NEW result (not a cached one) for all three distinct loading mechanisms the provider uses: a plain query function (`loadDealCreditMemo`, proving 146-B's `after-credit-memo-finalized`), a store-factory method (`createDataverseCreditApprovalDecisionStore().listDecisionsForDeal`, the Workstream C/D/E/F/H/J shared pattern), and a bespoke reconciling loader (`loadBoardingHandoffForDeal`, proving 146-E's servicing-owner assignment is picked up on the next `boardingHandoff` reload). |
| Dataverse dependency | None for the client-side mechanism proof above. The six Workstream C-H facts' reload proof against GENUINELY regenerated PAC output (not this session's hand-authored stand-in) is blocked with 146-A. |
| Operational dependency | Same as 146-A for the live end-to-end portion |
| Test coverage | `DealDataProvider.reloadProof.test.tsx` (3 tests, all passing) |
| Live verification requirement | Deferred to PR 148's controlled E2E for the full chain (real action -> real persistence -> reload -> exact readback -> stage consequence) — this workstream proves the client-side mechanism is sound; it does not substitute for that live proof |
| Owner | This session (client-side mechanism proof, done) / operator + this session (live E2E proof, PR 148, after 146-A unblocks) |
| Status | Client-side reload mechanism now has an automated, passing proof (not merely an assertion) that `refresh()` re-fetches rather than serving stale state, covering all three loading-mechanism shapes in the provider. This is real evidence for the "reload -> exact record readback" claim at the client layer; the live, real-Dataverse half of that claim remains blocked on 146-A per the mission's own "DO NOT claim live persistence without exact record readback" constraint. |

## 146-I — Admin capability truth model upgrade (8 dimensions)

| Field | Value |
|---|---|
| Classification | **CODE_FIX** |
| Code location | `src/admin/durableRecordCapabilityInventory.ts`, `src/admin/AdminDurableRecordCapabilityPanel.tsx` (Workstream M's existing simpler model) |
| Dataverse dependency | None new |
| Operational dependency | None |
| Test coverage | To be added alongside the model upgrade |
| Live verification requirement | None required — admin-facing derived truth panel, verifiable by unit test against known registry/inventory state |
| Owner | This session |
| Status | Not yet started — scoped after 146-B/E/F/G land, since the 8-dimension model should reflect their final shape (e.g., 146-B's memo-finalization capability, 146-E's servicing-owner capability) rather than being built against a stale inventory. |

---

**Sequencing note:** 146-A and the six-table portion of 146-H are the only workstreams blocked on
the operator's PAC push. Every other workstream (B, C, D-low-risk, E, F-investigation, G, I)
proceeds independently, per the user's explicit "code-only from me; you run the live steps"
direction.
