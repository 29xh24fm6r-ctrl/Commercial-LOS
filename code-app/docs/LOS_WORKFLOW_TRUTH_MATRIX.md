# LOS Workflow Truth Matrix

**Companion to** [LOS_FULL_WORKFLOW_ACTIVATION_ARC.md](./LOS_FULL_WORKFLOW_ACTIVATION_ARC.md). **PR 0 — read-only audit; no runtime change.**
**Grounded in source as of master `14d521f`.** This is the honest per-transition current state; every future arc PR is measured against it.

> **Update 2026-07-21 (E2E certification pass, `docs/E2E_CERTIFICATION_TEST_SCRIPT_2026-07-21.md`).**
> Per the codebase's own `CANONICAL_SOURCES.md`/doc-lineage convention, corrections are appended rather
> than the original claims rewritten. Two specific claims below are now stale — confirmed against current
> source, not re-asserted from an older doc:
> - **T2's "Required facts NOT in the live gate: risk rating — ABSENT/PLACEHOLDER... approval
>   authority... shallow booleans, caller-supplied"** is superseded. `src/workflow/creditApprovalAuthority.ts`
>   is a real, fail-closed authority check (banker's `cr664_approvallimit`/`cr664_creditcommitteemember`/
>   `cr664_approvaloverrideauthority`) and is wired directly into the live write seam
>   (`stageAdvanceWriteDependency.ts`), not just tested. An unauthorized/over-limit approver is genuinely
>   blocked from exiting Credit Approval today. Risk rating itself remains not live-gated.
> - **T6's boarding-readiness claim ("SHALLOW — a regex on the stage string... not a boarded-loan
>   record")** is superseded for the LOS-originated path. Once a deal's stage claims BOARDED, a real
>   `cr664_portfolioboardedloans` handoff record is reconciled (`boardingHandoffReadiness.ts`,
>   `loadBoardingHandoffForDeal.ts`) and is now created automatically on stage advance to BOARDED via
>   `buildLiveStageAdvanceDeps.ts`'s `onDealBoarded.run` — not only through the separate manual
>   `existingLoanEntryAdapter` path this doc originally described as the sole real write.
>
> Everything else in this document (Return/Decline/Withdraw preview-only, document/task substring
> matching, credit-memo lifecycle presence-only, conditions-precedent as a derived proxy rather than a
> real record) was independently re-verified during the 2026-07-21 pass and remains accurate.

> **Headline:** the system is **not yet** a complete, team-operable commercial loan workflow. Only forward
> **Advance** has a live write path; **Return/Decline/Withdraw are preview-only**; and the *live* stage gate is
> materially shallower than the *rigorous contract* gate. Several commercial-lending facts are shallow,
> placeholder, or projected from stage strings.

---

## Status legend

- **LIVE** — performs a governed persisted write with audit + timeline + readback.
- **PREVIEW-ONLY** — UI + policy + audit/readback machinery exist but no live write occurs (gated off / not mounted with live deps).
- **TRACKED** — schema-backed fact that a gate actually consumes.
- **SHALLOW** — satisfied by string/substring/presence, not a typed status.
- **ABSENT / PLACEHOLDER** — not implemented; gate stubbed or fails closed.

## The two-gate architecture (key finding)

There are **two** stage-gate models in the repo, and they are **not the same gate**:

1. **Live gate (the one that actually runs on forward Advance):**
   `evaluateStageTransitionPolicy` ([src/workflow/stageTransitionPolicy.ts](../src/workflow/stageTransitionPolicy.ts)) →
   `deriveLoanWorkflowReadiness` ([src/workflow/loanWorkflowRules.ts](../src/workflow/loanWorkflowRules.ts)) over the stage
   definitions ([src/workflow/loanWorkflowStages.ts](../src/workflow/loanWorkflowStages.ts)). It checks: required **fields**
   (blocking), required **documents** (blocking, by name substring), required **tasks** (at-risk / **non-blocking**),
   and **credit-memo presence**. It does **not** consume risk-rating, approval, commitment, closing, or funding facts.
2. **Rigorous contract gate (exists, but is NOT the live gate):**
   `evaluateExitGate` over `StageGateFacts` ([src/workflow/stageGateContract.ts](../src/workflow/stageGateContract.ts)).
   It models the deep facts (risk rating, underwriting review, approval decision/authority/conditions, commitment
   issued, borrower acceptance, conditions cleared, closing docs, collateral/insurance verified, funds disbursed,
   boarding). It is consumed by the **WIRED_DISABLED** canonical control and certification/diagnostics — **not** by the
   live forward-advance path. Risk rating in it is a hard placeholder (`select: () => false`, "risk rating system not
   yet implemented").

**The arc's central task: make the rigorous, fact-backed gate the real live gate, backed by real records — without
weakening any existing blocker.** (PR 2/3 unify these; PR 6–19 supply the real facts.)

---

## Per-transition matrix

Each transition lists: **UI surface · live policy gate · required facts (backing) · live-wired? · audited/timeline/readback? · smoke evidence · source files · gaps · recommended PR.**

### T1 — Intake → Underwriting
- **UI surface:** `DealStageProgressionCard` → `StageAdvanceControl` (Stage Map). PR #68 surfaces governed exit criteria + gates the button on the live policy.
- **Live policy gate:** `evaluateStageTransitionPolicy` (blocks when `deriveLoanWorkflowReadiness.status === 'blocked'`).
- **Required facts:** fields (clientName, amount, productType, loanStructure, targetCloseDate, industry, customerType) — **TRACKED/blocking**; document *loan application* — **SHALLOW** (name substring, blocking); tasks (initial borrower conversation, qualification review, application completeness review) — **SHALLOW/at-risk (non-blocking)**.
- **Live-wired:** ✅ Advance only. **Audited/timeline/readback:** ✅ via `buildLiveStageAdvanceDeps` → `advanceWorkflowStage`.
- **Smoke evidence:** ❌ `stageAdvancement.json` is `outcome:"failed"`, empty `affectedRecordIds` — not machine-proven.
- **Source:** `loanWorkflowStages.ts:32-54`, `loanWorkflowRules.ts:22-40,85-98`, `stageAdvanceWriteDependency.ts`, `buildLiveStageAdvanceDeps.ts`, `DealStageProgressionCard.tsx`.
- **Gaps:** document/task gating shallow (name substring; tasks non-blocking); intake verification (borrower/guarantor/ownership) not a typed fact; no machine-proven smoke.
- **Recommended PR:** PR 4 (typed docs), PR 5 (task blocking), PR 23/24 (smoke).

### T2 — Underwriting → Credit Approval
- **UI surface:** same Stage Map advance control.
- **Live policy gate:** `deriveLoanWorkflowReadiness` — fields + documents (financials, tax returns, ownership, collateral support, all **SHALLOW** substring) blocking; underwriting tasks at-risk; credit requirement *spreading/repayment analysis* checked by **presence** only.
- **Required facts NOT in the live gate:** **risk rating — ABSENT/PLACEHOLDER** (`stageGateContract.ts:117-121` `select:()=>false`); **underwriting recommendation — ABSENT** as a typed fact; spreading/repayment/collateral analysis completion — **SHALLOW** (no status).
- **Live-wired:** ✅ Advance only. **Audit/timeline/readback:** ✅.
- **Smoke evidence:** ❌ (shares stageAdvancement failed artifact).
- **Source:** `loanWorkflowStages.ts:56-78`, `loanWorkflowRules.ts:100-131`, `stageGateContract.ts:114-127`, `portfolio/riskRating/dualRiskRating.ts` (unrouted).
- **Gaps:** the defining Underwriting→Credit-Approval facts (risk rating, recommendation, analysis completion) are absent from the live gate; this transition currently passes on documents+fields alone.
- **Recommended PR:** PR 6 (risk rating), PR 7 (underwriting completion), PR 3 (engine).

### T3 — Credit Approval → Commitment
- **UI surface:** same Stage Map advance control.
- **Live policy gate:** `deriveCreditBlockers` — **presence-based** (memo `length>0`, section-label substring). **Approval decision / authority / conditions are NOT consumed by the live gate.**
- **Rigorous contract (not live):** `stageGateContract.ts:128-133` models `creditMemoFinalized`, `approvalDecisionRecorded`, `approvalAuthoritySufficient`, `approvalConditionsDocumented`; `approvalAuthorityMatrix.approvalSatisfies` = `approvalRecorded && approverIsAuthorized` (**TRACKED but shallow booleans**, caller-supplied).
- **Live-wired:** ✅ Advance only. **Audit/timeline/readback:** ✅.
- **Smoke evidence:** ❌.
- **Source:** `loanWorkflowStages.ts:80-102`, `loanWorkflowRules.ts:100-131`, `stageGateContract.ts:128-133`, `approvalAuthorityMatrix.ts:14-29`.
- **Gaps:** credit memo lifecycle (draft/reviewed/finalized/approved) absent — presence only; approval decision/authority/conditions not schema-backed records and not in the live gate; no routing/committee/amount-tier authority.
- **Recommended PR:** PR 8 (memo status), PR 9 (approval routing/authority/decision/conditions).

### T4 — Commitment → Documentation
- **UI surface:** same Stage Map advance control.
- **Live policy gate:** `deriveLoanWorkflowReadiness` — required document *commitment letter* (**SHALLOW** substring) + fields; task *commitment acceptance review* at-risk.
- **Required facts NOT tracked:** commitment **issued** / **borrower acceptance** / expiry / supersede — **ABSENT** as typed facts (only a document-name presence stands in).
- **Live-wired:** ✅ Advance only. **Audit/timeline/readback:** ✅.
- **Smoke evidence:** ❌.
- **Source:** `loanWorkflowStages.ts:103-115`.
- **Gaps:** no commitment issuance/acceptance record; expired/superseded commitment cannot block.
- **Recommended PR:** PR 13 (commitment/term-sheet workflow).

### T5 — Documentation → Closing & Funding
- **UI surface:** same Stage Map advance control.
- **Live policy gate:** required documents (loan agreement, insurance evidence — **SHALLOW**) + field guarantorStructure; **closing requirement** *conditions precedent resolved* via `deriveClosingBlockers` (blocks only if a required doc/task is missing — **derived, not a real condition record**).
- **Required facts NOT tracked:** conditions-precedent records, collateral/insurance/lien/title verification, documentation prep/execution status — **ABSENT** as typed facts.
- **Live-wired:** ✅ Advance only. **Audit/timeline/readback:** ✅.
- **Smoke evidence:** ❌.
- **Source:** `loanWorkflowStages.ts:116-134`, `loanWorkflowRules.ts:133-143`.
- **Gaps:** conditions precedent are not real records with status/waiver-authority; verification facts absent.
- **Recommended PR:** PR 14 (documentation & conditions precedent).

### T6 — Closing & Funding → Boarded
- **UI surface:** same Stage Map advance control; boarding status panel `DealPortfolioBoardingStatusPanel`.
- **Live policy gate:** required document *booking package* (**SHALLOW**) + task *booking quality control* (at-risk) + closing requirement *post-close exceptions identified* (derived).
- **Boarding readiness:** **SHALLOW** — `derivePortfolioBoardingStatus(stage)` is a **regex on the stage string** (`/\b(fund|funded|funding|closed|closing|booked|booking|servic)/i`), not a boarded-loan record.
- **Required facts NOT tracked:** executed docs, funds disbursed, booking-QC completion, post-close exceptions — **ABSENT** as typed facts.
- **Live-wired:** ✅ Advance only. **Audit/timeline/readback:** ✅.
- **Smoke evidence:** ❌ for the LOS advance. (Note: `portfolioBoarding.json` **PASSED** with real `affectedRecordIds` — but that is the **separate manual** `existingLoanEntryAdapter`/`boardExistingLoan` path, not the LOS-originated stage advance.)
- **Source:** `loanWorkflowStages.ts:135-147`, `portfolioBoardingStatus.ts:18-34`, `portfolioBoarding/existingLoanEntryAdapter.ts`.
- **Gaps:** closing/funding/booking-QC facts absent; boarding derived from stage string, not a boarded-loan handoff record.
- **Recommended PR:** PR 15 (closing/funding/booking QC), PR 16 (real boarded-loan handoff).

### T7 — Return (any stage → prior)
- **UI surface:** `StageWorkflowControl` Return button (form: target + reason) — **WIRED_DISABLED** (`intentionallyUnrouted.ts`).
- **Engine/deps:** `canonicalStageTransition.evaluateCanonicalStageTransition` (RETURN validated) + `buildLiveCanonicalTransitionDeps` (transport/audit/timeline/readback all implemented).
- **Live-wired:** ❌ **PREVIEW-ONLY** — `StageWorkflowControl` renders `PREVIEW_MESSAGE` unless `liveEnabled` (default false) + `onTransition` with live deps; `executeCanonicalStageTransition` returns `disabled` while `AUTO_STAGE_ADVANCE_ENABLED` is off.
- **Audit/timeline/readback:** capable (built), but **not exercised live**. **Smoke evidence:** ❌.
- **Source:** `canonicalStageTransition.ts`, `buildLiveCanonicalTransitionDeps.ts:94-268`, `StageWorkflowControl.tsx:37,43-44,88-92`, `intentionallyUnrouted.ts`.
- **Gaps:** not mounted with live deps; no return/rework record or required remediation items; no readback proof captured.
- **Recommended PR:** PR 10 (governed Return), PR 21 (unified engine).

### T8 — Decline (+ adverse action)
- **UI surface:** `StageWorkflowControl` Decline button (structured reason) — **WIRED_DISABLED**.
- **Engine/deps:** DECLINE validated in `canonicalStageTransition`; live deps map DECLINE to an ApprovalDecision timeline event + status write with readback.
- **Live-wired:** ❌ **PREVIEW-ONLY** (same gate as T7). Adverse-action tracking — **ABSENT**.
- **Audit/timeline/readback:** capable; not live. **Smoke evidence:** ❌.
- **Source:** `canonicalStageTransition.ts`, `buildLiveCanonicalTransitionDeps.ts:55-74,183-233`, `StageWorkflowControl.tsx`.
- **Gaps:** not live; no reason-code schema, no adverse-action requirement/notification tracking, no authority/committee control on decline.
- **Recommended PR:** PR 11 (governed Decline & adverse action).

### T9 — Withdraw
- **UI surface:** `StageWorkflowControl` Withdraw button (reason) — **WIRED_DISABLED**.
- **Engine/deps:** WITHDRAW validated in `canonicalStageTransition`; live status write + timeline + readback via deps.
- **Live-wired:** ❌ **PREVIEW-ONLY** (same gate as T7).
- **Audit/timeline/readback:** capable; not live. **Smoke evidence:** ❌.
- **Source:** `canonicalStageTransition.ts`, `buildLiveCanonicalTransitionDeps.ts`, `StageWorkflowControl.tsx`.
- **Gaps:** not live; no reason-code schema; no reopen workflow.
- **Recommended PR:** PR 12 (governed Withdraw).

---

## Summary table

| # | Transition | Live write | Gate depth | Audit/TL/readback | Smoke proven | Recommended PR |
|---|-----------|-----------|-----------|-------------------|--------------|----------------|
| T1 | Intake → Underwriting | ✅ Advance | SHALLOW (docs substring; tasks non-blocking) | ✅ capable | ❌ | 4, 5, 23/24 |
| T2 | Underwriting → Credit Approval | ✅ Advance | SHALLOW + risk/recommendation **ABSENT** | ✅ | ❌ | 6, 7, 3 |
| T3 | Credit Approval → Commitment | ✅ Advance | memo **presence**; approval facts not in live gate | ✅ | ❌ | 8, 9 |
| T4 | Commitment → Documentation | ✅ Advance | commitment issuance/acceptance **ABSENT** | ✅ | ❌ | 13 |
| T5 | Documentation → Closing & Funding | ✅ Advance | conditions precedent **derived**, not records | ✅ | ❌ | 14 |
| T6 | Closing & Funding → Boarded | ✅ Advance | closing/funding **ABSENT**; boarding = stage string | ✅ | ❌ (LOS path) | 15, 16 |
| T7 | Return | ❌ preview-only | engine built, not mounted live | capable | ❌ | 10, 21 |
| T8 | Decline | ❌ preview-only | + adverse action absent | capable | ❌ | 11 |
| T9 | Withdraw | ❌ preview-only | reason schema absent | capable | ❌ | 12 |

## Fact backing summary (from the read-only audit)

| Fact | Status | Where |
|------|--------|-------|
| Required documents | **SHALLOW** (name substring) | `loanWorkflowRules.ts:85-93` |
| Required tasks | **TRACKED but non-blocking** (at-risk) | `loanWorkflowRules.ts:32-40` |
| Credit memo | **SHALLOW** (presence / section-label substring) | `loanWorkflowRules.ts:100-131` |
| Risk rating | **ABSENT / PLACEHOLDER** (`select:()=>false`) | `stageGateContract.ts:117-121` |
| Underwriting recommendation | **ABSENT** (typed) | `loanWorkflowStages.ts:56-78` |
| Approval decision / authority / conditions | **TRACKED but shallow booleans**, not in live gate | `stageGateContract.ts:128-133`, `approvalAuthorityMatrix.ts:14-29` |
| Commitment issuance / borrower acceptance | **ABSENT** (doc presence only) | `loanWorkflowStages.ts:103-115` |
| Conditions precedent | **DERIVED**, not real records | `loanWorkflowRules.ts:133-143` |
| Closing / funding / booking-QC | **ABSENT** (typed) | `loanWorkflowStages.ts:135-147` |
| Boarded-loan handoff | **SHALLOW** (stage-string regex) | `portfolioBoardingStatus.ts:18-34` |
| Covenants / ticklers / monitoring / annual review / watchlist / early warning | **Real modules, UNROUTED** (portfolio domain, not deal-gated) | `portfolio/*`, `annualReview/*`, `intentionallyUnrouted.ts` |

## Smoke evidence (docs/operator-evidence/final-launch/)

| Capability | Outcome | affectedRecordIds | Machine-proven |
|-----------|---------|-------------------|----------------|
| stageAdvancement | **failed** | empty | ❌ (pending re-capture) |
| portfolioBoarding | passed | `65177b38-…` | ✅ (manual existing-loan path) |
| crmLivePersistence | passed | `12d8dfda-…` | ✅ |
| documentChecklist | passed | empty | ⚠️ (no record lineage) |
| borrowerSend | passed | empty | ⚠️ (external send, no record) |

The **stage-advancement transition itself has no machine-proven smoke** — the single most important gap for PR 23/24.

---

## What PR 0 asserts

- The system is **not** full-workflow-ready today; forward Advance is live, non-forward paths are preview-only, and the live gate is shallow relative to the rigorous contract.
- **PR #68 is preserved** as a separate, scoped Stage Map clarity fix.
- **No runtime behavior changed** by PR 0; no gate flipped; no evidence created. This document and the optional
  `src/workflow/losWorkflowTruthMatrix.ts` are descriptive only.
