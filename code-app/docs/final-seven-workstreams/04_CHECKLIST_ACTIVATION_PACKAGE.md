# Workstream 4 — Document Checklist Activation Package

**Status: COMPLETE — AWAITING OPERATOR EVIDENCE.**

## What this investigation found

The generator, idempotency logic, and allow-listed live-write path were already real and fully
implemented — the gap was never "build a generator." Confirmed via code reading:

- `src/deals/newDealChecklistGenerationAdapter.ts`'s `generateAuditedDocumentChecklist` is a real,
  audited, fail-closed generator with case-insensitive/trim-aware idempotency (skips names already
  present), an allow-listed payload, and audit-only-after-every-row-succeeds discipline.
- `src/deals/newDealChecklistGenerationLiveDeps.ts`'s `buildLiveAuditedChecklistDeps()` wires real
  `Cr664_documentchecklistsService` create/getAll calls — genuine IO, not a stub.
- `src/workflow/checklistWriteDependency.ts` already has a controlled activation mechanism: its
  `config.enabled` parameter bypasses the global `DOCUMENT_CHECKLIST_GENERATION_ENABLED` constant
  for test/evidence purposes, matching exactly what the spec asked for ("prefer an environment-
  specific build flag over weakening the production guard").

**A genuine finding**: three independent, unconnected implementations of "generate a document
checklist" exist in this codebase — `checklistWriteDependency.ts` + `GenerateWorkflowChecklistButton.tsx`
(the one production call site, currently rendering a disabled notice since the flag is off),
`documentChecklistUiGenerationAction.ts` + `documentChecklistPilotConfig.ts` (a separate,
unwired preview→confirm bridge from a 2026-07 phase), and `src/activation/checklistGenerationActivation.ts`
(a separate product+stage rule engine, also unwired). Consolidating these three is a larger,
architecturally risky change out of scope for this pass — noted here, not silently hidden.

## What was actually missing and is now fixed

No test asserted an **exact expected row count** against a real stage template. Added to
`newDealChecklistGenerationAdapter.test.ts`, using the REAL Underwriting stage template
(`loanWorkflowStages.ts`, 4 required documents — Business financial statements / Tax returns /
Ownership information / Collateral support):

- Generates exactly 4 rows on first run — no more, no fewer.
- An immediate full rerun creates zero additional rows and emits zero new audit rows (the exact
  idempotent-rerun proof the operator runbook's step 7 requires before recording live evidence).
- A partial rerun (some rows pre-existing) creates only the missing ones.

## Operator runbook

`docs/remediation/FINAL_PRODUCTION_COMPLETION_OPERATOR_RUNBOOKS_2026-07-22.md`'s Runbook 2 (written
in the prior session, still accurate) is the exact, ordered live-evidence-capture procedure: confirm
the gate state, generate on a `SYSTEM TEST -` deal, confirm the preview, confirm the write, verify
the expected Dataverse rows, rerun to prove idempotency, capture the audit row, record evidence,
verify with `npm run verify:launch-evidence`.

## Classification

**COMPLETE — AWAITING OPERATOR EVIDENCE.** `DOCUMENT_CHECKLIST_GENERATION_ENABLED` remains `false` —
not flipped by this pass, per the explicit instruction not to enable production globally without
approval.
