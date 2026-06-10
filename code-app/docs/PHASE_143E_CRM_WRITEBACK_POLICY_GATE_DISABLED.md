# Phase 143E — CRM Writeback Policy Gate (Disabled by Default)

> **Disabled by default.** Defines the policy gate that must approve any future
> CRM writeback. Even when every prerequisite is satisfied, `allowedForLiveWriteNow`
> stays false and the best status is `ready_for_dry_run` — never live.

## What was added
- `src/crm/writeback/crmWritebackPolicyGate.ts` — `evaluateCrmWritebackPolicyGate`.

## Input / result
Input: provider, entityKind, operationKind, requestedFields, sourceOfTruthConfirmed,
identityMatchConfirmed, conflictFree, auditModelReady, rollbackReady,
allowlistConfigured, mode `disabled_by_default`. Result: status (`blocked_disabled`|
`blocked_policy`|`ready_for_dry_run`|`rejected`), `allowedForLiveWriteNow: false`,
`liveWritePerformed: false`, `externalSystemChanged: false`, blockers/warnings,
deterministic `policyGateProofId`.

## Rules / safety posture
Even when all prerequisites are true, live write remains false — only
`ready_for_dry_run` is allowed, never `ready_for_live`. Unsupported fields reject.
Stage/status/lifecycle/amount/pricing/credit fields are blocked from any writeback.
