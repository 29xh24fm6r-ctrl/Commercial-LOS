# Final Production Completion — Current-State Architecture & Lifecycle Truth Matrix

**Branch:** `fix/final-production-completion`, based on synced `master` @
`1099d43f08948b25f2f9958c157a755afe2f022e`. Reproduced against current code this pass (feature-flag
values read directly from source, not from any prior doc).

**Live feature-flag values (`src/deals/dealOriginationFeatureFlags.ts`), confirmed this pass:**
`AUTO_STAGE_ADVANCE_ENABLED=true`, `TASK_GENERATION_ENABLED=true`, `DUPLICATE_DETECTION_ENABLED=true`,
`DUPLICATE_MERGE_APPLY_ENABLED=false`, `PORTFOLIO_SIDE_EFFECTS_ENABLED=false` (a separate, unrelated
side-effects hook — see note below), `GOVERNANCE_REASON_FIELD_ENABLED=false`,
`DOCUMENT_CHECKLIST_GENERATION_ENABLED=false`, `DOCUMENT_FILE_UPLOAD_ENABLED=false`,
`BORROWER_MESSAGING_ENABLED=false`. `BANKER_CREATE_PILOT_ENABLED=true`
(`src/deals/bankerCreatePilotConfig.ts`) scopes New Deal create live for the one approved pilot
surface only; the global `NEW_DEAL_CREATE_ADAPTER_ENABLED` stays `false`.

**Important correction to a stale prior assumption:** `PORTFOLIO_SIDE_EFFECTS_ENABLED` gates a
*different* mechanism (`src/deals/newDealPortfolioSideEffectsAdapter.ts`) than the live BOARDED
auto-boarding path. The auto-board call (`buildLiveStageAdvanceDeps.ts`'s `onDealBoarded`) has **no
feature flag** — it runs unconditionally whenever a deal reaches BOARDED and `AUTO_STAGE_ADVANCE_ENABLED`
allows the move. An older governance doc (`LAUNCH_DEFECT_REGISTER_AND_GO_NO_GO_2026-07-22.md`, written
before Workstream K) claimed portfolio boarding's persistence was "OFF" — that claim is stale for the
current architecture and was independently re-verified false this pass.

## Lifecycle truth matrix — CRM relationship → Boarded

| Step | Gate file | Write-seam persists? | Audit + Timeline wired? | Flag armed? | Test coverage | Classification |
|---|---|---|---|---|---|---|
| CRM relationship → deal creation | `newDealCrmIntakeGate.ts` + `bankerNewDealCreateRollout.ts:61-82` + `bankerCreatePilotConfig.ts` + `newDealCreateAdapter.ts:269-445` | Yes — `Cr664_loandealsService.create()`, readback of client/team binds | Audit: yes. Timeline: **no timeline row on create** (a minor, non-blocking gap) | Armed via pilot override; global constant false | `dealOriginationAdapters.test.ts`, `bankerNewDealCreateRollout.test.ts` | **LIVE** |
| Intake → Underwriting | `stageTransitionPolicy.ts` + `loanWorkflowRequirementEngine.ts` (`evaluateStageExitPolicy`/`deriveStageExitReadiness`), wired at `stageAdvanceWriteDependency.ts:161-178` | Yes — `buildLiveStageAdvanceDeps.ts:101-152`, readback-verified | Both wired (`buildLiveStageAdvanceDeps.ts:154-231`) | `AUTO_STAGE_ADVANCE_ENABLED=true` | `stageAdvanceWriteDependency.test.ts`, `buildLiveStageAdvanceDeps.test.ts` | **LIVE**, contingent on the `cr664_dealstagereferences` seed row existing — **OPERATOR-DEPENDENT** for that prerequisite |
| Underwriting → Credit Approval | Same seam; documents "business financial statements"/"tax returns" require `reviewed`, not merely received; deep facts (risk rating, UW recommendation) `tracked:false` | Same transport | Same | Same | Same suite + `finding C2` block proving reviewed-vs-received blocks; new Workstream I/J tests proving zero-memo blocks | **LIVE** for shallow/typed facts; risk-rating/UW-recommendation are **BLOCKED** (no schema) |
| Credit Approval → Commitment | Same seam + hard credit-authority gate (`creditApprovalAuthority.ts`) | Same | Same | Same (authority check has no separate flag) | `finding C3` block, `creditApprovalAuthority.test.ts` (13 cases) | **LIVE** for authority enforcement; deeper approval-decision/committee-package facts remain **BLOCKED** (no schema) |
| Commitment → Documentation | Same seam; shallow facts only | Same | Same | Same | Generic suite (no per-transition test) | **LIVE** shallow gate; commitment-issuance/acceptance facts **BLOCKED** (no schema) |
| Documentation → Closing & Funding | Same seam; shallow facts + derived conditions-precedent proxy | Same | Same | Same | Generic suite | **LIVE** shallow gate; real conditions-precedent record **BLOCKED** (no schema) |
| Closing & Funding → Boarded | Same seam; shallow facts + derived post-close-exceptions proxy | Same for the stage move itself | Same | Same | Generic suite | **LIVE** shallow gate; funds-disbursed/executed-docs facts **BLOCKED** (no schema) |
| → Boarded (auto-boarding side-effect) | No flag — `buildLiveStageAdvanceDeps.ts:233-235` | Yes — real `cr664_portfolioboardedloan` create via `existingLoanEntryAdapter.ts`, duplicate-number guard + readback | Own audit entry; best-effort, never reverses the stage move | Not flag-gated | `stageAdvanceWriteDependency.test.ts` "auto-board" suite, `buildLiveStageAdvanceDeps.test.ts`, `existingLoanEntryAdapter.test.ts`, Workstream K's `autoBoardProductChain.test.ts` | **LIVE**; risk-rating/portfolio-manager on the boarded record never populated (no source, never fabricated) |

## Server-side enforcement floor

`dataverse-plugins/CommercialLendingLOS.Plugins/LoanDealGovernedTransitionPlugin.cs` exists, is
well-documented, but per its own deployment doc is **NOT built, registered, or deployed** against any
live environment. Every gate in the table above is therefore enforced **100% client-side** — a direct
Dataverse Web API write (bypassing this app entirely) can skip stages, ignore credit authority, or
move a terminal (DECLINED/WITHDRAWN/BOARDED) deal, and nothing above would stop or even see it. This
is the single most consequential open item in the entire system and is squarely operator/Phase-9
scope (compiling + registering the plugin requires a live Dataverse admin action this sandbox cannot
perform).

## Non-forward transitions (Return / Decline / Withdraw)

Contrary to a stale note in `docs/LOS_WORKFLOW_TRUTH_MATRIX.md` (its T7-T9 sections, last updated
2026-07-21, calling these "PREVIEW-ONLY... not mounted"), these are confirmed LIVE-MOUNTED in current
code: `src/deals/DealGovernedTransitionPanel.tsx` renders `StageWorkflowControl` with `liveEnabled` and
real `buildLiveCanonicalTransitionDeps`, and is itself mounted directly in
`src/deals/BankerDealWorkspace.tsx`. Gated only by `AUTO_STAGE_ADVANCE_ENABLED` (true) and
`GOVERNANCE_REASON_FIELD_ENABLED` (false — reasons are written to audit notes only, not a queryable
column). That doc was not corrected in this pass (a documentation-only fix, tracked as a known,
low-risk follow-up).
