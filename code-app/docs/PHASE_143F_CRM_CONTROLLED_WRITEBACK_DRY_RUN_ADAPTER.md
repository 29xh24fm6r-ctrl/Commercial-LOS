# Phase 143F — CRM Controlled Writeback Adapter (Dry-Run First)

> **Dry-run only.** Accepts a policy-approved preview plan and returns a
> deterministic dry-run proof. Never calls Salesforce/nCino, never uses the
> network, never returns a live write.

## What was added
- `src/crm/writeback/crmControlledWritebackAdapter.ts` — `submitCrmControlledWriteback`.

## Input / result
Input: provider, planId, `dryRunOnly: true`, policyGateStatus, operations,
requestedByDisplayName, requestedAt. Result: status (`dry_run_recorded`|`rejected`),
`dryRunOnly: true`, `liveWritePerformed: false`, `salesforceWritePerformed: false`,
`ncinoWritePerformed: false`, `externalSystemChanged: false`, deterministic
`dryRunProofId`, audit summary.

## Rules / safety posture
Never call Salesforce/nCino; never use network; never return success as a live
write. Reject `dryRunOnly: false`, a policy gate that is not `ready_for_dry_run`,
executable/suspicious payloads, and unsupported operations.
