# Final Production Completion — Operator Runbooks (Stage Advancement, Document Checklist, Borrower Send)

**Branch:** `fix/final-production-completion` (based on synced `master` @ `1099d43f08948b25f2f9958c157a755afe2f022e`).
Companion to `docs/governance/LAUNCH_DEPLOYMENT_RUNBOOK_2026-07-22.md` (overall deployment sequencing)
and `docs/governance/RELEASE_INVENTORY_2026-07-22.md`. This document gives the exact, ordered
operator steps for the three launch-evidence capabilities that are **not yet HIGH confidence**:
`stageAdvancement`, `documentChecklist`, `borrowerSend`. `crmLivePersistence` and `portfolioBoarding`
are already accepted at HIGH confidence (verified this pass via `npm run verify:launch-evidence`)
and need no further action.

None of the commands below can be executed from this sandbox — no `pac` CLI, no live Dataverse
credentials, no Power Platform environment access exist here. Every step is an operator action to be
run from Matthew's machine (`C:\Users\MatthewPaller\projects\powerapp-project\code-app`), signed in
as `mpaller@oldglorybank.com` against `https://org3a57b8d4.crm.dynamics.com`
(environment `5f2d77a5-de50-edeb-9d74-5b2400a2320d`).

---

## Runbook 1 — Stage Advancement

**Current evidence state:** `docs/operator-evidence/final-launch/stageAdvancement.json` records
`outcome: "failed"`, `liveOperationPerformed: false`, no `affectedRecordIds` — the prior artifact is
an honest placeholder, not machine-proven. `AUTO_STAGE_ADVANCE_ENABLED = true` in source already (the
code path is live); only the evidence capture is outstanding.

1. **Prerequisite verification — seven canonical stage references.** Confirm exactly one active,
   `new_productionapproved = true` row exists per canonical stage code in `cr664_dealstagereferences`:
   `INTAKE`, `UNDERWRITING`, `CREDIT_APPROVAL`, `COMMITMENT`, `DOCUMENTATION`, `CLOSING_FUNDING`,
   `BOARDED` (`src/workflow/stageOrderingContract.ts:17-23,51-57`). Query via the maker portal or:
   ```
   pac org who
   ```
   then inspect the table data directly in the Dataverse table editor. If any stage is missing or
   duplicated, resolve via `scripts/seed-stage-references.mjs` (dry-run first, confirm output, then
   `-Apply` per that script's own usage banner) before proceeding — do not hand-author rows.
2. **Select a controlled test deal.** Use (or create) a deal explicitly named with the `SYSTEM TEST -`
   prefix per this initiative's naming rule, currently at stage `INTAKE`, status `Open`, with the
   INTAKE stage's required fields already populated (client name, amount, product, structure,
   industry, customer type — see `src/workflow/loanWorkflowStages.ts`) so the write-seam gate is
   genuinely clear, not accidentally blocked.
3. **Perform the governed Intake → Underwriting transition** as the signed-in operator, from the
   deal's Advance control in the live app (not a direct API call — the point is to exercise the real
   client-side write path `stageAdvanceWriteDependency.ts` → `buildLiveStageAdvanceDeps.ts`).
4. **Deal readback.** Re-open the deal (or hard-refresh) and confirm the Stage now reads
   "Underwriting" and `cr664_stageentrydate` reflects the transition time — this proves the app's own
   readback-verification step (`buildLiveStageAdvanceDeps.ts`'s `readbackDealStage`) genuinely
   confirmed persistence, not merely optimistic local state.
5. **Audit-row verification.** In `cr664_auditevents`, find the row keyed to this deal with
   `cr664_eventtype` = the status-change/advance code and `cr664_correlationid` matching the
   operation (surfaced in the app's own confirmation/toast if shown, or the newest row for this deal
   at this timestamp). Record its `cr664_auditeventid`.
6. **Timeline-row verification.** In `cr664_dealtimelineevents`, find the matching `StageChanged` row
   for this deal at this timestamp (`TIMELINE_EVENT_TYPE_STAGE_CHANGED = 788190006`,
   `src/deals/buildLiveStageAdvanceDeps.ts:51`). Record its `cr664_dealtimelineeventid`.
7. **Rollback / cleanup.** This is a `SYSTEM TEST -` deal, so no cleanup is strictly required for data
   hygiene, but to keep the evidence honestly reversible: either leave the test deal at Underwriting
   (clearly marked test data) or manually revert its Stage back to Intake via the table editor and
   note that manual correction in the evidence file's `rollbackNote`. Do **not** attempt to reverse the
   audit/timeline rows — they are an honest historical record of what happened.
8. **Exact GUID capture.** Record: the deal's `cr664_loandealid`, the audit row's
   `cr664_auditeventid`, the timeline row's `cr664_dealtimelineeventid`. These become
   `affectedRecordIds` in the evidence file.
9. **Evidence recording command:**
   ```
   powershell -File scripts/dataverse/run-final-launch-smokes.ps1 -RecordManualEvidence path\to\stageAdvancement.json
   ```
   Author `stageAdvancement.json` with: `capability: "stageAdvancement"`, `outcome: "passed"`,
   `operatorUpn: "mpaller@oldglorybank.com"`, real `startedAtIso`/`completedAtIso` (sub-second
   precision — a round `:00.000Z` timestamp is treated as a low-confidence hand-recorded clock, see
   `isSyntheticTimestamp` in `src/access/finalLaunchSmokeEvidence.ts`), `liveOperationPerformed: true`,
   `readbackVerified: true`, `auditVerified: true`, and `affectedRecordIds` = the three GUIDs above.
   Never fabricate any of these values — if a step above could not be completed, do not record
   `outcome: "passed"`.
10. **Evidence verifier command:**
    ```
    npm run verify:launch-evidence
    ```
    Confirm `stageAdvancement: accepted=true confidence=HIGH` in the printed report before considering
    this capability launch-ready.

---

## Runbook 2 — Document Checklist

**Current evidence state:** `documentChecklist.json` records `outcome: "passed"` but carries **no**
`affectedRecordIds`, so `deriveEvidenceIntegrity` correctly rejects it as insufficient (no machine
proof) regardless of the self-reported outcome. `DOCUMENT_CHECKLIST_GENERATION_ENABLED = false` in
source (`src/deals/dealOriginationFeatureFlags.ts:33`) — the generation UI button is currently
hard-disabled (`src/workflow/GenerateWorkflowChecklistButton.tsx:76`, "Generate checklist"), so this
capability is gated OFF as well as evidence-insufficient. Both must be addressed.

1. **Exact gate state.** Confirm `DOCUMENT_CHECKLIST_GENERATION_ENABLED` is still `false` in the
   deployed build (it is a source-level constant; flipping it requires a code change + redeploy, not
   a runtime toggle). This is an explicit, deliberate operator/product decision to arm this
   capability — do not flip it as a side effect of capturing evidence; capture evidence with a
   locally-built, flag-enabled test build first if the intent is only to prove the capability works,
   OR flip the flag in a dedicated follow-up commit once the business is ready to go live with
   auto-generated checklists.
2. **Exact UI action.** Once the flag is enabled (locally or in a follow-up build), on a controlled
   `SYSTEM TEST -` deal at a stage with checklist requirements, click "Generate checklist" on the
   `GenerateWorkflowChecklistButton` surface.
3. **Preview.** Confirm the UI shows the proposed checklist rows (document/task requirements) before
   committing, per `src/deals/documentChecklistUiGenerationAction.ts`'s preview step.
4. **Generation.** Confirm the write.
5. **Expected Dataverse rows.** Confirm new rows in `cr664_documentchecklists` (and/or the paired task
   table) matching the previewed set — no more, no fewer.
6. **Readback.** Re-open the deal's Documents/Checklist panel and confirm the newly-generated
   requirements display with the correct status (outstanding/received as appropriate).
7. **Idempotent rerun.** Trigger generation again on the same deal/stage. Confirm it does NOT create
   duplicate rows for requirements already present (the generator must be idempotent per its own
   design intent) — this is itself part of what "passed" should mean; if it duplicates, this is a
   genuine defect to fix before recording evidence, not something to paper over.
8. **Audit verification.** Confirm a matching `cr664_auditevents` row for the generation action.
9. **Cleanup.** Since this is a `SYSTEM TEST -` deal, either leave the generated checklist rows in
   place (clearly test data) or delete them via the table editor and note this in the evidence's
   `rollbackNote`.
10. **Exact GUID capture.** Record the deal id, each created checklist-row id, and the audit-row id.
11. **Evidence recording command:** same pattern as Runbook 1 —
    ```
    powershell -File scripts/dataverse/run-final-launch-smokes.ps1 -RecordManualEvidence path\to\documentChecklist.json
    ```
    with `affectedRecordIds` populated from step 10 — an empty array here is exactly what caused the
    current rejection; do not repeat that mistake.
12. **Evidence verification command:**
    ```
    npm run verify:launch-evidence
    ```
    Confirm `documentChecklist: accepted=true confidence=HIGH`.

---

## Runbook 3 — Borrower Send

**⚠ WARNING: no send may occur without explicit operator authorization and an approved recipient.
This is the highest-risk capability in the app (a real external email). Do not run any step below
against a real borrower's email address. Use only a pre-approved internal test mailbox, and obtain
Matthew's (or another named approver's) explicit go-ahead before sending anything, live-mode or not.**

**Current evidence state:** `borrowerSend.json` carries none of the required `EXTERNAL_SEND`
machine-proof fields (`deliveryReceiptId`, `approvedRecipient`, `approverUpn` are all absent) — see
`src/access/finalLaunchSmokeEvidence.ts`'s `deriveEvidenceIntegrity`, `EXTERNAL_SEND` branch.
`BORROWER_MESSAGING_ENABLED = false` and `BORROWER_EMAIL_TRANSPORT_ENABLED = false` in source
(`src/deals/dealOriginationFeatureFlags.ts`) — this capability is gated fully OFF today.

1. **Office 365 Outlook connector state.** Confirm the connector is registered in the Power Platform
   environment (Maker Portal → Connections) and its connection reference
   (`new_Office365OutlookCommercialLOS`, `power.config.json`) is bound to a real, authorized mailbox.
2. **Generated service binding.** Confirm the SDK has been regenerated so the live adapter binds a
   real, typed `Office365OutlookService.SendEmailV2` call (not a stub) — check
   `src/generated/services/` for the Office 365 service and that
   `src/deals/emailDelivery/*` references it, not a disabled/mocked transport.
3. **`VITE_EMAIL_MODE=LIVE`.** Confirm this environment variable is set for the deployed build
   (`src/deals/emailDelivery/emailMode.ts:48` reads `import.meta.env.VITE_EMAIL_MODE`, uppercased).
   Anything else (including unset) keeps sends in a safe non-live mode.
4. **Approved test recipient.** Confirm with Matthew (or the designated approver) the exact,
   pre-approved internal mailbox to use — never a real borrower address for this smoke.
5. **Named approver.** Record who explicitly authorized this specific send attempt (their UPN) —
   this becomes `approverUpn` in the evidence file and must be a real, attributable identity, never a
   sentinel value.
6. **Perform the send** via the app's real borrower-communication UI (e.g. `BorrowerCommunication.tsx`
   / the draft-update send flow), addressed only to the approved test recipient from step 4, with the
   flags from steps 2-3 armed.
7. **Transport receipt.** Capture the delivery-receipt identifier the Office 365 connector returns
   from the send call — this becomes `deliveryReceiptId`.
8. **Delivery verification.** Confirm the test mailbox actually received the message (manually check
   the inbox) — do not accept the transport call's mere "success" response as delivery proof.
9. **Audit verification.** Confirm a matching audit/communication-activity row was written for this
   send (per `src/deals/borrowerCommunicationActivity` / whatever the live send path's own audit
   sink is) with the correct actor, recipient, and timestamp.
10. **Evidence recording:** author `borrowerSend.json` with `capability: "borrowerSend"`,
    `outcome: "passed"`, `operatorUpn` (the person who performed the send),
    `approverUpn` (the person who authorized it — may be the same person, but the field must be
    populated either way), `approvedRecipient` (the test mailbox address), `deliveryReceiptId` (from
    step 7), `deliveryVerified: true`, `auditVerified: true`, and real, sub-second timestamps. Then:
    ```
    powershell -File scripts/dataverse/run-final-launch-smokes.ps1 -RecordManualEvidence path\to\borrowerSend.json
    ```
11. **Evidence verification command:**
    ```
    npm run verify:launch-evidence
    ```
    Confirm `borrowerSend: accepted=true confidence=HIGH`.

**Do not flip `BORROWER_MESSAGING_ENABLED` / `BORROWER_EMAIL_TRANSPORT_ENABLED` to `true` in source
as a side effect of this smoke** — arming the capability for real bankers to use is a separate,
explicit product/operator decision to make after the smoke is captured and reviewed, following the
same governed-cutover convention as every other write-path flag in this app.

---

## Summary — what this unblocks

Once all three runbooks are complete and `npm run verify:launch-evidence` shows all five capabilities
`accepted=true confidence=HIGH`, `deriveProductionEnvironmentVerification()`'s `enabledCount` can
reach 6/6 and `fullLaunchReady` becomes achievable **once the corresponding gate flags are also
flipped** (a separate, later, explicit governed step — evidence alone never flips a gate; see
`src/admin/productionEnvironmentVerification.ts`'s own doc comment: "Evidence/flags gate DOWN;
nothing asserts launch UP").
