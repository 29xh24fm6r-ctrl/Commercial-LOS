# Full System Activation — Punch List (2026-07-08)

**Scope:** the six live-write domains on the *Full System Activation Launch Certification* panel
(`src/admin/FullSystemActivationLaunchPanel.tsx`). **Purpose:** the exact, evidence-grounded
steps to bring each blocked domain to a *legitimate* green — no flag flipped to make the
dashboard green, no fabricated evidence.

> **Produced read-only.** This document changes no gate and writes no evidence. The repo code
> for all six domains is already fully wired; every remaining item below is either an
> operator/maker action reserved for a human with environment access, or a real smoke that
> must actually run.

---

## 0. The headline: the code is wired; the gates are held closed on purpose

A domain flips to `enabled` only when **all three** conditions hold
([`productionEnvironmentVerification.ts:243`](../src/admin/productionEnvironmentVerification.ts#L243)):

```
enabled = certified && gateFlagOn && evidenceHigh
```

| Condition | Meaning | Satisfied by | Current |
| --- | --- | --- | --- |
| `certified` | operator asserts the env work is done + verified | operator toggle | ✅ all 6 |
| `gateFlagOn` | the live feature flag is actually on | a real flag flip | 2/6 (new-deal pilot, stage armed) |
| `evidenceHigh` | a committed smoke artifact passes integrity at **HIGH** | `run-final-launch-smokes.ps1` output | ❌ artifacts are placeholders / `failed` |

There is **no code-only path to green**. The integrity check
([`finalLaunchSmokeEvidence.ts:142`](../src/access/finalLaunchSmokeEvidence.ts#L142)) rejects
sentinel operators, missing machine proof, and synthetic timestamps by design.

### Two senses of "done" (do not conflate them)
- **Operationally usable today** — Portfolio boarding (*Add Existing Loan*) and CRM writeback
  (*Add Company*) are already live via **manual governed writes**, gated by banker identity +
  authorization + audit + readback, **not** by any feature flag. You can board the book and
  write CRM right now. See [`MASTER_ACTIVATION_STATUS_AND_OPERATOR_RUNBOOK.md`](./MASTER_ACTIVATION_STATUS_AND_OPERATOR_RUNBOOK.md).
- **Cert-screen green** — the formal launch milestone requiring flag + HIGH smoke evidence. The
  per-domain steps below are for this track.

---

## 1. HIGH-confidence evidence requirements (every smoke)

An artifact in `docs/operator-evidence/final-launch/<capability>.json` is accepted at **HIGH**
only when ALL hold:

- `outcome: "passed"`
- `liveOperationPerformed: true`
- `readbackVerified: true`
- closure verified: `rollbackVerified: true` for CRUD capabilities; for `borrowerSend`,
  `deliveryVerified` / `auditVerified` (an email cannot be rolled back)
- `operatorUpn` = a real, attributable UPN (`local@domain.tld`) — **never** a sentinel
  (`system`, `unknown-operator`, all-zero GUID, etc.)
- machine proof:
  - CRUD capabilities: non-empty `affectedRecordIds`
  - `borrowerSend`: `deliveryReceiptId` + `approvedRecipient` + a valid `approverUpn`
- `completedAtIso` is a **real machine clock**, not a round `…:00.000Z` (that downgrades to LOW)

The harness never runs itself and the agent never writes these files.

---

## 2. Per-domain steps (in the order to do them)

### 2.1 Stage advancement — closest to green; fully wired
Live path already wired: `DealStageProgressionCard` → `StageAdvanceControl` →
`buildLiveStageAdvanceDeps` → `advanceWorkflowStage`. Flag `AUTO_STAGE_ADVANCE_ENABLED` is armed.
Prereq is a stage-reference seed (maker):

1. In make.powerapps.com, add column `cr664_sequence` (Whole Number) to `cr664_dealstagereferences`.
2. Seed the 7 canonical stages with ascending sequences:
   ```
   node scripts/seed-stage-references.mjs --commit
   ```
   (requires `DATAVERSE_BEARER_TOKEN` + environment URL env vars). Sequences:
   `INTAKE=10, UNDERWRITING=20, CREDIT_APPROVAL=30, COMMITMENT=40, DOCUMENTATION=50, CLOSING_FUNDING=60, BOARDED=70`.
3. Verify:
   ```
   node scripts/seed-stage-references.mjs --verify
   ```
   Expect: "Seven stages present with unique sequences."
4. Regenerate the SDK so `cr664_sequence` is on the model.
5. Run one in-app governed advance on a test deal (INTAKE → UNDERWRITING); confirm stage
   update + audit row + timeline row + readback.
6. Record evidence:
   ```
   pwsh scripts/dataverse/run-final-launch-smokes.ps1 -RecordManualEvidence -Capability stageAdvancement
   ```

### 2.2 Portfolio boarding
Verified schema state **already hydrates** from committed token-backed evidence
(`CURRENT_PORTFOLIO_VERIFICATION_EVIDENCE`, 13/219/12). Remaining:

1. Confirm the current boarding schema evidence still hydrates (fresh window) — it is consumed
   by `resolvePortfolioLoanBoardingRuntimeAdapter` via the runtime gate.
2. Run the automated smoke:
   ```
   pwsh scripts/dataverse/run-final-launch-smokes.ps1 -Apply -Capability portfolioBoarding
   ```
   (CRUD on a launch-test record + `rollbackVerified` cleanup)
3. Flip `PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED` + `PORTFOLIO_BOARDING_ROUTE_ENABLED`
   (governed flag-flip).

### 2.3 CRM writeback / live persistence
Verified schema state **already hydrates** (`CURRENT_CRM_VERIFICATION_EVIDENCE`, 10/147). Remaining:

1. Confirm CRM schema evidence still hydrates (consumed by `resolveCrmPersistenceAdapter`).
2. Run the automated smoke:
   ```
   pwsh scripts/dataverse/run-final-launch-smokes.ps1 -Apply -Capability crmLivePersistence
   ```
3. Flip `CRM_LIVE_PERSISTENCE_ENABLED`.

### 2.4 Document checklist generation
Rule-set signoff is **already recorded**
(`docs/operator-evidence/DOCUMENT_CHECKLIST_LENDING_OWNER_SIGNOFF_2026-06-25.md`). Both gates
(`DOCUMENT_CHECKLIST_GENERATION_ENABLED`, `CHECKLIST_WRITE_ENABLED`) are safe-off `false`. Remaining:

1. Flip `DOCUMENT_CHECKLIST_GENERATION_ENABLED` + the UI action gate (governed flag-flip).
2. Smoke one deal (preview → generate → verify N `cr664_documentchecklists` rows + audit +
   idempotent re-run), then:
   ```
   pwsh scripts/dataverse/run-final-launch-smokes.ps1 -RecordManualEvidence -Capability documentChecklist
   ```

### 2.5 Borrower communication send — hardest; `NOT_SAFE_TO_ENABLE`
1. Register the **Office 365 Outlook connector** in the Power Platform environment.
2. Regenerate the SDK so the LIVE adapter binds the typed `Office365OutlookService.SendEmailV2` call.
3. Deploy with `VITE_EMAIL_MODE=LIVE`.
4. Do one audited send to an **approved test recipient**, capturing the transport
   `deliveryReceiptId`, `approvedRecipient`, and a named `approverUpn`, then:
   ```
   pwsh scripts/dataverse/run-final-launch-smokes.ps1 -RecordManualEvidence -Capability borrowerSend
   ```
5. Flip `BORROWER_MESSAGING_ENABLED` + `BORROWER_EMAIL_TRANSPORT_ENABLED`.

---

## 3. Owner split

| Step type | Owner |
| --- | --- |
| Maker Portal / Dataverse schema + seed; connector registration; SDK regen | **Operator/maker** |
| Run smoke harness + record evidence | **Operator** |
| Governed flag-flips (the 4 `*_ENABLED` constants) | **Operator decision** (agent can make the edit once decided) |
| Verified-state loader + gate wiring | **Done** — `runtimeVerifiedSchemaBridge.ts` (already wired + tested) |
| Test/doc updates | Agent |

---

## 4. State of the agent-side (CC) prep items

- **Verified-state loader wiring** — **already complete and tested.**
  `runtimeVerifiedSchemaBridge.ts` hydrates `VerifiedCrmSchemaState` / `VerifiedBoardingSchemaState`
  from real evidence (fail-closed, no probing, no fabrication) and is consumed by
  `controlledLiveCutoverReadiness.ts`, `finalLaunchReadiness.ts`, `unifiedCrmReadiness.ts`,
  `pacTableAccessEvidence.ts`. Coverage in `runtimeVerifiedSchemaBridge.test.ts` proves:
  missing/absent state → blocked; `conflicts > 0` → blocked; complete state satisfies the gate;
  flag-off still fails closed. An additional committed-evidence contract test pins these four
  guarantees against the *committed* `CURRENT_*_VERIFICATION_EVIDENCE` path.
- **`CHECKLIST_WRITE_ENABLED`** — already reset to safe-off `false`
  ([`checklistGenerationActivation.ts:20`](../src/activation/checklistGenerationActivation.ts#L20));
  the three contract tests already assert `false`. No source change needed. (The
  `MASTER_ACTIVATION` runbook's "inconsistency" note predates the sweep and is corrected there.)
- **Stage certification copy** — the cert-model / verification blocker text historically named
  `AdvanceWorkflowStageButton`; the live injection actually happens in
  `DealStageProgressionCard → StageAdvanceControl`. Copy corrected; the orphan component is left
  in place pending a reachability-safe removal decision.

---

## 5. Hard rules for this activation (do not violate)

1. Do **not** flip live gates to make the dashboard green.
2. Do **not** hand-write evidence JSON; only the operator-run harness produces it.
3. Do **not** claim a domain is enabled without its smoke artifact passing integrity at HIGH.
