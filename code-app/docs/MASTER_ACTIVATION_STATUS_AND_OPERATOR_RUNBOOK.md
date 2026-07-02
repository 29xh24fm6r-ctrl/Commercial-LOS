# MASTER ACTIVATION — Status & Operator Runbook (all 5 owner-activatable domains)

**Spec:** OGB LOS — MASTER ACTIVATION SPEC. **Path chosen by owner:** *Honest per-domain — CC wires, you smoke.*
**Produced by:** AE-0 preflight + per-domain read-only wiring audit (this session). **No flags flipped, no live writes, no fabricated evidence.**

## The headline finding (reframes the spec's premise)

The spec assumed these five domains are "flags-off, waiting for CC to wire + activate." The repo history says otherwise:
- Phase 256B (`5ff16b2`, 2026-06-25) flipped all six gates ON with genuine GO operator smoke evidence.
- **Completion Phase A (`57c7170`, 2026-06-29 — you)** deliberately reset the live-write flags to **safe-off**: *"contradicting the honest 1/6 certification... Reset each to its SAFE DEFAULT (off)... Flags gate DOWN, never assert UP. Certification authority unchanged at 1/6 (New Deal pilot only)."*

So the current flags-off state is a **deliberate, 2-day-old governance decision**, not un-built work. And critically: **the two highest-priority domains don't depend on those flags at all.**

## Two distinct write architectures (the key distinction)

1. **Manual, operator-initiated governed writes** (Add Existing Loan, Add Company). Gated by **operator identity + authorization + audit + readback + dup-guard** — NOT by any feature flag. **Already wired and live-capable today.**
2. **Automated / secondary writes** (LOS-originated boarding create-flow, CRM spine sync, auto stage-advance, auto checklist generation). Gated by the feature flags Completion Phase A reset. **Off by design; still unrouted or gate-blocked.**

---

## Per-domain status & exact remaining steps

### AE-1 — Portfolio boarding (load the existing book) · **TOP PRIORITY** · ✅ CC-COMPLETE
- **State:** Already wired + live-capable. `ExistingPortfolioLoansPanel` → `boardExistingLoan(input, buildLiveExistingLoanDeps())` does real Dataverse writes ([existingLoanEntryAdapter.ts:298,426](../src/portfolioBoarding/existingLoanEntryAdapter.ts#L298)), governed by authorization + identity + dup-guard + readback + audit. Live-mounted in **Banker → Loan Workflow** ([BankerLoanWorkflowTab.tsx:37-40](../src/banker/BankerLoanWorkflowTab.tsx#L37)) with `useBanker()` identity. (PortfolioCommandCenter mounts it read-only by design, redirecting here.)
- **Gate that matters:** `useBanker()` must resolve a real `systemUserId` (no `writeDisabledReason`) at runtime. Fail-closed: if identity doesn't resolve, buttons disable with a clear reason.
- **`PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED` = false does NOT block this path** — it gates the separate, unrouted LOS-originated create-flow resolver.
- **Your smoke:** Banker → Loan Workflow → **Add Existing Loan**. Enter ONE real loan (loan number + borrower legal name required). Submit. Verify: (a) success outcome + it appears in the boarded list; (b) the `cr664_portfolioboardedloanauditentries` row exists (actor + correlation `xl…` + "Manual Existing Loan Entry"); (c) readback matched (no `readback-mismatch`). Then board the rest of the book.
- **Rollback:** none needed for reads; a mis-boarded record can be deactivated/deleted in Dataverse. No flag involved.
- **CC action required: NONE.**

### AE-2 — KPI baseline dedupe · operator-only, no code · ✅ CC-COMPLETE
- **State:** Fail-closed and correct. Live Dataverse holds multiple active `cr664_systemsettings` rows with conflicting `KPI_BASELINE_DATE`; [kpiBaselineResolution.ts](../src/admin/kpiBaselineResolution.ts) returns `ambiguous` and the UI shows "baseline ambiguous" (never a fabricated number).
- **Your steps (pure Dataverse data edit):** 1) In the admin DQ surface, read the `KPI_BASELINE_DATE` flag listing the N conflicting values. 2) Choose the ONE approved baseline date. 3) In `cr664_systemsettings`, keep a single active row with that value; deactivate/delete (or blank `KPI_BASELINE_DATE` on) the conflicting rows. 4) Reload — the DQ flag clears and `resolveKpiBaselineDate` returns `resolved`.
- **CC action required: NONE.**

### AE-3 — CRM writeback (manual governed) · ✅ CC-COMPLETE
- **State:** Already wired + live-capable, same architecture as AE-1. `CrmHubWorkspace` is live-mounted in `BankerShell` ([BankerShell.tsx:382-385](../src/banker/BankerShell.tsx#L382)) with `useBanker()` identity; `CrmWriteActions` → `buildLiveCrmWriteFns` → live Dataverse services. The live write files (`workspace/CrmWriteActions.tsx`, `write/crmWriteActions.ts`, `write/crmWriteAdapter.ts`) contain **no reference to `CRM_LIVE_PERSISTENCE_ENABLED`**; the gate is `authGate` on authorization + identity ([crmWriteAdapter.ts:91-101](../src/crm/write/crmWriteAdapter.ts#L91)).
- **`CRM_LIVE_PERSISTENCE_ENABLED` = false does NOT block this path** — it gates the separate, unrouted CRM spine persistence/writeback adapter (`resolveCrmPersistenceAdapter`, `crmLiveDataverseAdapter`, `intentionallyUnrouted:184`).
- **Your smoke:** Banker → CRM Hub → **Add Company**. Create ONE org. Verify: (a) `cr664_crmorganizations` row created; (b) readback verified; (c) `cr664_crmauditentries` audit row exists.
- **Rollback:** deactivate/delete the test record in Dataverse. No flag involved.
- **CC action required: NONE.**

### AE-4 — Stage advancement · ⛔ BLOCKED on your schema seed · CC-deferred by design
- **State:** Built + tested but `StageWorkflowControl` is **unrouted (WIRED_DISABLED)** at [intentionallyUnrouted.ts:353](../src/navigation/intentionallyUnrouted.ts#L353); `AUTO_STAGE_ADVANCE_ENABLED = false`. Fail-closed on ordering: [resolveStageOrdering](../src/workflow/stageOrderingContract.ts) returns `unavailable` until the stage-reference table is seeded, so advancement cannot fire.
- **Hard prerequisite (maker/operator — I cannot do these):**
  1. In make.powerapps.com, add column `cr664_sequence` (Whole Number) to `cr664_dealstagereferences`.
  2. Seed the 7 canonical stages with unique ascending sequences: `INTAKE=10, UNDERWRITING=20, CREDIT_APPROVAL=30, COMMITMENT=40, DOCUMENTATION=50, CLOSING_FUNDING=60, BOARDED=70` — `node scripts/seed-stage-references.mjs --commit` (with `DATAVERSE_BEARER_TOKEN` + env URL set).
  3. `node scripts/seed-stage-references.mjs --verify` → expect "Seven stages present with unique sequences."
  4. Regenerate the SDK so `cr664_sequence` is exposed on the model.
- **Then (per honest per-domain):** CC mounts `StageWorkflowControl` into the deal workspace (`liveEnabled` wired to the armed flag + injected transport/audit/timeline). You run the single-record smoke on a test deal (INTAKE→UNDERWRITING): verify stage update + audit row + timeline row + readback + rollback. Only then arm `AUTO_STAGE_ADVANCE_ENABLED`.
- **CC action now: NONE (deferred until seed done).** The control is deliberately kept unrouted until seeded + armed — routing it now would be premature.

### AE-5 — Document checklist generation · ⛔ BLOCKED on governed gate-flip · signoff already done
- **State:** Rule-set signoff **already recorded + committed** (`docs/operator-evidence/DOCUMENT_CHECKLIST_LENDING_OWNER_SIGNOFF_2026-06-25.md`; parsed as `CHECKLIST_RULESET_SIGNOFF`, status SIGNED). Generation adapter is composed into the live orchestrator (BankerNewDealCreate → `orchestrateDealOrigination` → `runNewDealChecklistGeneration`), but the runtime gate `DOCUMENT_CHECKLIST_GENERATION_ENABLED = false` blocks writes (fail-closed at [newDealChecklistGenerationAdapter.ts:191](../src/deals/newDealChecklistGenerationAdapter.ts#L191)) and the UI action is disabled. A prior write-proof exists (Phase 188E: 3 rows + audit, idempotent).
- **`deriveChecklistSignoffReadiness`** reports SIGNED but `gateFlipBlocked = true`: *"Signoff recorded. The DOCUMENT_CHECKLIST_GENERATION_ENABLED gate flip remains a separate governed step."*
- **Your steps:** flip `DOCUMENT_CHECKLIST_GENERATION_ENABLED` (and the UI action flags) via the governed gate-flip step, deploy, then smoke one deal (preview → generate → verify N `cr664_documentchecklists` rows + audit + idempotent re-run). Rollback = flag back to false.
- **⚠️ Governance inconsistency to decide (see below).**
- **CC action now: NONE without your decision** — the only CC-doable code is the flagged inconsistency below.

---

## Flagged decision — `CHECKLIST_WRITE_ENABLED` inconsistency

Phase 256B flipped **both** `DOCUMENT_CHECKLIST_GENERATION_ENABLED` and `CHECKLIST_WRITE_ENABLED` to true. Completion Phase A reset the former to false but **left `CHECKLIST_WRITE_ENABLED = true`** ([checklistGenerationActivation.ts:20](../src/activation/checklistGenerationActivation.ts#L20)). By Completion Phase A's own principle ("reset live-write flags to safe defaults (off); flags gate DOWN"), this looks like a missed reset.

- **Runtime impact today: NONE** — `generateAndWriteChecklist` has no live caller, and the orchestrator write path is already blocked by `DOCUMENT_CHECKLIST_GENERATION_ENABLED = false`. So it's an honesty/defense-in-depth inconsistency, not a live-write exposure.
- **Why I did not just fix it:** flipping it to false requires editing **governance contract tests** that intentionally assert it `= true` as the 256B launched state (`phase212_224FullSystemActivationContract.test.ts:47`, `phase249ChecklistSignoffOutlookUnblock.test.ts:40`, `checklistGenerationActivation.test.ts:52`). That's adjudicating between two of your own committed intents — I won't do it silently.
- **My recommendation:** reset `CHECKLIST_WRITE_ENABLED = false` to match Completion Phase A's intent and restore defense-in-depth, updating the three contract-test assertions toward safe-off (exactly as Completion Phase A did for ~75 files). Say the word and I'll do it as a gated, tsc+vitest-green commit.

---

## Bottom line

Per the honest per-domain path you chose, **the CC side of this spec is complete to the operator boundary:**
- **AE-1, AE-3** need no CC wiring — they're already live; run your identity-gated smoke and you're boarding the book / writing CRM today.
- **AE-2** is a Dataverse data edit (steps above).
- **AE-4** is blocked on your schema seed; CC wiring is deliberately deferred until then.
- **AE-5** signoff is done; it's blocked on your governed gate-flip; one CC cleanup awaits your decision.

The remaining steps are the operator actions the spec's own hard rules reserve for you (single-record smoke, schema seed, governed gate-flip, dedupe). I did not flip any flag, perform any live write, or fabricate any evidence.
