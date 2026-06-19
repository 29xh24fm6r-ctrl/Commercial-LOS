# Phase 193A — CRM Live Gates + Schema Apply Orchestrator

**Status:** Complete. Turns the Phase 189K inspect/plan adapter into a unified,
controlled live-capable schema apply orchestrator. Default behavior is no-write.

**Branch:** `phase193a-crm-live-gates-and-apply-orchestrator` (base: `master`).
**Stack:** first PR of the Phase 193 factory; later PRs branch from this tip.

## Delivered

- `src/crm/crmSalesforceSpineLiveGates.ts` — fail-closed evaluation of the
  schema-apply and live-persistence gates.
- `src/crm/crmSalesforceSpineApplyOrchestrator.ts` —
  `runCrmSpineSchemaOrchestrator({ mode })` supporting inspect / plan / dry-run
  apply / live apply.

## Gates (live apply)

All required, evaluated fail-closed:

- `CRM_LIVE_SCHEMA_APPLY_ENABLED === "true"` (injected string)
- `CRM_LIVE_PERSISTENCE_ENABLED === "true"` (injected string)
- acknowledgement `=== "APPLY_CRM_SPINE_SCHEMA"`
- `targetEnvironmentPresent === true`
- `operatorAuthorized === true`
- a non-empty deterministic `correlationId`

Gate values are injected; no env/secret reads; the build-time
`CRM_LIVE_PERSISTENCE_ENABLED` boolean is never flipped.

## Outcomes

`inspect_completed` · `plan_generated` · `dry_run_completed` ·
`blocked_gate_not_satisfied` · `apply_completed` · `partial_success` ·
`failed_dataverse`.

## Safety

- No live mutation in tests — the live path runs only against an INJECTED
  executor (a stub in tests; nothing real is touched).
- Dry-run produces planned operations with `executed: false`.
- No `PublishXml`/metadata op runs unless the gate is satisfied and an executor
  is wired; idempotent (already-present targets skipped) and resumable
  (`alreadyAppliedTargets`).
- No delete operation, no SDK/fetch import, no fake schema-success copy.

## Validation

- `npm test -- phase193A crmSalesforceSpine apply orchestrator gates` — green.
- `npm run build` — green.
- `npm test -- crmGovernance noFakeProductionData releaseCandidateSnapshot` — green.
