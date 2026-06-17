# Phase 188E — Document checklist pilot live proof (one controlled deal)

- **Date:** 2026-06-17
- **Worktree:** `C:\Users\MatthewPaller\projects\powerapp-project\code-app-188e` (isolated).
- **Branch:** `phase188e-document-checklist-proof` (on top of 188D `8d9d5dd`).
- **Builds on:** 188A audit, 188B inspector, 188C adapter, 188D pilot UI.

## Purpose

Add the single guarded **live-write** mode that proves the document checklist
generator can create checklist requirement rows for **one** existing pilot deal,
emit the correct audit (`cr664_ChangedBy = /cr664_users`, never `/systemusers`),
remain idempotent, and never contact a borrower.

## Pre-check finding — `cr664_correlationid` is NOT a column (188C discrepancy)

Live metadata of `cr664_documentchecklists` has **no `cr664_correlationid`
column** (required-for-create is `cr664_Deal` + `cr664_documentname` only). The
Phase 176A/188C generator allow-list (`DOCUMENT_CHECKLIST_ALLOWED_FIELDS`)
includes `cr664_correlationid`, so a live POST of it would be rejected.

**Therefore the proof-mode row payload is `cr664_documentname` +
`cr664_Deal@odata.bind` ONLY**; the correlation id is recorded on the **audit
event** (which does have `cr664_correlationid`). This is logged here as a **188C
adapter discrepancy / runtime correction to apply before the app-runtime path
writes live**: drop `cr664_correlationid` from the adapter's checklist-row
allow-list (keep it on the audit), or add the column to the table.

## The proof mode

```
node scripts/phase122-lookup-repair.mjs --commit-document-checklist-generation-proof \
  --deal-id 1a10a165-756a-f111-ab0c-70a8a59be491 \
  --document-names "2024 Business Tax Return|2025 Interim Financial Statements|Debt Schedule" \
  --actor-upn <operator/core-user UPN> \
  --correlation-id <explicit proof correlation id>
```

It is the **only** mode that writes checklist rows. It:
1. Re-runs the 188B readiness checks (deal-id only); proceeds **only** on
   `READY_TO_COMMIT` or `ALREADY_GENERATED`; stops (`PROOF_BLOCKED`) on
   `BLOCKED` / `UNSAFE_EXTERNAL_COMMUNICATION`.
2. Refuses blank/duplicate names.
3. Resolves the actor UPN → `/cr664_users(<CoreUser>)` via the platform-user
   bridge **before** writing (fail closed on zero/multiple/inactive/empty
   CoreUser); the audit emit **refuses** any non-`/cr664_users` bind.
4. Creates **only the missing** rows (2-field payload), in order.
5. Emits **one** `cr664_auditevents` row **after all rows succeed**.
6. Fails closed: first-create failure → `PROOF_BLOCKED`; later-create failure →
   `PROOF_PARTIAL_FAILURE` (no audit); audit failure → `PROOF_AUDIT_FAILED`
   (rows exist, not a clean success).
7. Reads back the deal's rows.

Final status: `PROOF_CREATED` / `PROOF_ALREADY_GENERATED` / `PROOF_BLOCKED` /
`PROOF_PARTIAL_FAILURE` / `PROOF_AUDIT_FAILED`.

## Pilot deal + approved names

- **Pilot deal id:** `1a10a165-756a-f111-ab0c-70a8a59be491` (the certified New
  Deal proof deal).
- **Approved names:** `2024 Business Tax Return`, `2025 Interim Financial
  Statements`, `Debt Schedule`.

## Proof execution status — pending operator run

The proof **code is built and committed**, but the **live Dataverse write was
NOT executed in this environment** (no bearer token is available here; the live
write requires the operator's `DATAVERSE_BEARER_TOKEN`). The operator runs the
sequence below in this isolated worktree with a fresh token:

```
# 1. inspect (read-only)
node scripts/phase122-lookup-repair.mjs --inspect-document-checklist-graph --deal-id 1a10a165-756a-f111-ab0c-70a8a59be491
# 2. plan (read-only)
node scripts/phase122-lookup-repair.mjs --plan-document-checklist-generation --deal-id 1a10a165-756a-f111-ab0c-70a8a59be491 \
  --document-names "2024 Business Tax Return|2025 Interim Financial Statements|Debt Schedule"
# 3. proceed ONLY if READY_TO_COMMIT or ALREADY_GENERATED, then run the proof ONCE
node scripts/phase122-lookup-repair.mjs --commit-document-checklist-generation-proof \
  --deal-id 1a10a165-756a-f111-ab0c-70a8a59be491 \
  --document-names "2024 Business Tax Return|2025 Interim Financial Statements|Debt Schedule" \
  --actor-upn mpaller@oldglorybank.com --correlation-id dc-proof-2026-06-17-1
# 4. re-run plan -> expect ALREADY_GENERATED (idempotency)
node scripts/phase122-lookup-repair.mjs --plan-document-checklist-generation --deal-id 1a10a165-756a-f111-ab0c-70a8a59be491 \
  --document-names "2024 Business Tax Return|2025 Interim Financial Statements|Debt Schedule"
```

Record the inspect status, plan status, proof status, idempotency re-plan status,
and the audit row (deal id, created names, skipped names, correlation id,
`/cr664_users` ChangedBy bind) back into this doc after the run.

## Safety confirmations

- **No borrower communication** — the proof section imports/references no
  `sendDocumentRequestEmail` / `prepareDocumentRequestHandoff` / Outlook / email
  / SMS / handoff / mailto (governance test pins it).
- **Checklist row payload excludes `cr664_correlationid`** (2 fields only);
  **correlation id is audit-only.**
- **No `cr664_documenttype` / stage / status / portfolio / CRM / borrower field.**
- **`/cr664_users` ChangedBy bind required; `/systemusers` rejected.**
- **No UI enablement** — `DOCUMENT_CHECKLIST_PILOT_UI_ENABLED` stays `false`; the
  panel's generate button stays disabled.
- **No New Deal create / auto-run; one deal only; no bulk/broad operation.**
- **`DOCUMENT_CHECKLIST_GENERATION_ENABLED` stays `false`** for the app runtime
  (the proof is a script-only override against one deal).

## Tests

[phase188EChecklistProofModeContract.test.ts](../src/shared/governance/phase188EChecklistProofModeContract.test.ts)
(23): args/exclusivity, readiness gate before write, blank/duplicate refusal,
`/cr664_users`-only actor bind resolved before write, `/systemusers` refusal,
row allow-list excludes `cr664_correlationid` (audit-only), audit-after-all-rows
ordering, partial/audit fail-closed statuses, all five terminal statuses,
readback, and the no-comms / no-UI / gate-false / no-New-Deal boundaries.
