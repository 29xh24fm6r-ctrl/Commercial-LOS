# Phase 188B — Document checklist pilot readiness inspector

- **Date:** 2026-06-17
- **Spec:** SPEC-DOWNSTREAM-DOCUMENT-CHECKLIST-GENERATION-PILOT-1 (Phase 188B).
- **Branch:** `phase188-document-checklist-pilot`.
- **Builds on:** [Phase 188A write-path audit](./PHASE_188A_DOCUMENT_CHECKLIST_WRITE_PATH_AUDIT.md).

## Purpose

Two **read-only** operator modes in `scripts/phase122-lookup-repair.mjs` that
prove a deal is safe to generate a document checklist for — before any runtime
change exists. They resolve the target Loan Deal, confirm metadata + identity +
comms-safety, list existing checklist rows for idempotency, and emit a single
terminal status. They make **no** Dataverse writes, contact **no** borrower, and
enable **nothing**.

## Operator commands

```
# Readiness inspection (by deal name or deal id)
node scripts/phase122-lookup-repair.mjs --inspect-document-checklist-graph --deal-name "V1 Banker Create Proof - 2026-06-16 8"
node scripts/phase122-lookup-repair.mjs --inspect-document-checklist-graph --deal-id 1a10a165-756a-f111-ab0c-70a8a59be491

# Dry-run plan for a caller-supplied approved checklist
node scripts/phase122-lookup-repair.mjs --plan-document-checklist-generation --deal-name "V1 Banker Create Proof - 2026-06-16 8" \
  --document-names "2024 Business Tax Return|2025 Interim Financial Statements|Debt Schedule"

# Optional machine-readable output
node scripts/phase122-lookup-repair.mjs --inspect-document-checklist-graph --deal-id <guid> --json
```

`--inspect-document-checklist-graph` and `--plan-document-checklist-generation`
each require exactly one of `--deal-name "<name>"` / `--deal-id <guid>`; plan mode
additionally requires `--document-names "A|B|C"`.

## What inspect checks (read-only)

- Resolves **exactly one** target Loan Deal (zero / multiple ⇒ BLOCKED).
- Confirms `cr664_documentchecklists` metadata; the required-for-create set must
  remain **only** `cr664_Deal` (lookup → `cr664_loandeals`) + `cr664_documentname`
  (any other required field ⇒ BLOCKED).
- Confirms `cr664_documenttype` is a file-type picklist, **not** a checklist
  category/template (it must not be in the generator allow-list).
- Confirms the audit actor bind shape is `/cr664_users(<CoreUser>)` and that the
  `assertChangedByCoreUserBind` guard exists — a `/systemusers` bind ⇒ BLOCKED.
- Lists existing checklist rows on the deal (name + id + created/modified).
- Statically scans the generator code path for **any** borrower-communication
  import (`sendDocumentRequestEmail`, `prepareDocumentRequestHandoff`, Outlook,
  email, SMS, handoff, mailto) ⇒ UNSAFE_EXTERNAL_COMMUNICATION if found.

## What plan adds (read-only dry-run)

Parses the caller-supplied approved names (trim + case-insensitive, mirroring
`newDealChecklistGenerationAdapter`) and reports:
- **would_create** — names not already on the deal,
- **already_present** — names already on the deal,
- **blocked_reasons** — missing graph, ambiguous deal, missing/unexpected
  required metadata, unsafe comms import, empty or duplicate input names.

It never calls the generator, writes a row, or contacts a borrower.

## Expected statuses

| Status | Meaning |
| --- | --- |
| `READY_TO_COMMIT` | Graph safe; at least one row would be created (plan) / deal has no checklist yet (inspect). |
| `ALREADY_GENERATED` | Graph safe; all requested names already exist (plan) / the deal already has checklist rows (inspect). |
| `BLOCKED` | Deal ambiguous/missing, metadata missing or has unexpected required fields, bad bind shape, or invalid/duplicate input. |
| `UNSAFE_EXTERNAL_COMMUNICATION` | A borrower-communication import was detected on the generator path. |

## Safety boundary

Pure GETs + static source scans. No POST/PATCH/DELETE/PublishXml, no
bypass/suppress/force headers, no borrower messaging, no email, no SMS, no
Outlook, no handoff, no New Deal creation, no CRM/portfolio/stage automation. The
`DOCUMENT_CHECKLIST_GENERATION_ENABLED` gate stays `false`; the generator adapter
is **not** modified in 188B.

## Why this phase is read-only

188B is the "verify before write" gate of the certified systems-integrity
pattern (map → **verify** → provision fail-closed → enable → one proof →
certify). It must be safe to run against the live pilot deal repeatedly with zero
side effects, and it must independently prove the generation path can never reach
a borrower before any write capability is built.

## What 188C is allowed to do next

- Add a live `runCreateChecklistRow` over `Cr664_documentchecklistsService.create`
  and a live existing-names reader (`getAll` filtered by `cr664_Deal`).
- Add an **audit emit** to the generator reusing `createActorChangedByResolver` +
  `assertChangedByCoreUserBind`, emitting **only after** rows succeed
  (partial/fail-closed otherwise — never fake success).
- Keep the pilot flag **false** by default; idempotent; import no comms module.

## What remains prohibited (188C onward)

No borrower messaging / email / SMS / Outlook / handoff. No auto-run on New Deal
create. No public create. No CRM / portfolio / stage automation. No new New Deal.
No enabling `DOCUMENT_CHECKLIST_GENERATION_ENABLED` until 188E, after deploy and a
`READY` graph, for exactly one proof against deal
`1a10a165-756a-f111-ab0c-70a8a59be491`.
