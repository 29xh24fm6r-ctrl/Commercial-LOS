# Phase 193I — CRM Admin Controls + Runbooks

**Status:** Complete. Production-grade admin status controls and operational
runbooks for the live CRM system. The control panel reports posture only — it
enables nothing and performs no write.

**Branch:** `phase193i-crm-admin-controls-and-runbooks`. **Depends on:** 193A–H (stacked).

## Delivered

- `src/crm/crmAdminControlModel.ts` — `deriveCrmAdminControlState` summarizing
  gate status, environment target, last operation/failure, partial-success
  records, recent correlation ids, and the enabled/disabled summary.
- `src/crm/CrmAdminControlPanel.tsx` — read-only gate + environment status panel.

## Admin controls (status only)

Schema apply gate status · persistence gate status · environment target · last
operation · last failure · correlation ids · partial-success records ·
disabled/enabled summary. No live action buttons live on this panel — execution
happens on the gated recovery console (193C) behind hard gates.

## Operator runbooks

### Inspect
Run `runCrmSpineSchemaOrchestrator({ mode: 'inspect', correlationId, snapshot })`
(or the recovery console "Run inspect"). Review present/partial/missing
tables and conflicts. No writes.

### Plan
Run mode `plan` to generate deterministic create steps. No writes.

### Dry-run apply
Run mode `dry-run-apply` and `persistCrmSpineRecords({ mode: 'dry-run', ... })`.
Both execute nothing (`executed: false`) and report exactly what would happen.

### Live apply
Only after every schema-apply gate is satisfied — `CRM_LIVE_SCHEMA_APPLY_ENABLED
=== "true"`, `CRM_LIVE_PERSISTENCE_ENABLED === "true"`, acknowledgement
`APPLY_CRM_SPINE_SCHEMA`, environment present, authorized operator, deterministic
correlation id — AND a metadata executor is wired. Run mode `live-apply`. It is
idempotent (already-present artifacts skipped) and resumable
(`alreadyAppliedTargets`).

### Live persistence
After schema verification, persistence runs only when the persistence gate
(ack `PERSIST_CRM_SPINE_RECORDS`) is satisfied and a transport is wired. Every
write emits an audit payload with a correlation id.

### Disable gates
Set the injected `CRM_LIVE_SCHEMA_APPLY_ENABLED` / `CRM_LIVE_PERSISTENCE_ENABLED`
config values to anything other than `"true"` (or omit them) and drop the
acknowledgement. Every live path immediately fails closed — no code change, no
deploy. The admin panel then shows both gates `closed`.

### Verify CRM records
Re-run inspect; confirm tables/columns/relationships are present and the runtime
schema gate (`deriveCrmRuntimeSchemaGate`) reports `schemaReady`. Spot-check
created records by correlation id in the audit payloads.

### Handle partial success
`partial_success` means part of an operation got a real Dataverse response and
part failed/skipped (e.g. account linked, relationship failed). Read the per-step
/ per-record audit payloads (each has `correlationId`, `actor`, `outcome`,
`error`). Re-run live apply with `alreadyAppliedTargets` for the succeeded items
to complete the remainder; nothing already-present is re-created.

### Rollback guidance (manual)
There is NO automatic rollback. CRM schema/record creation is forward-only and
non-destructive (no delete path exists). To "roll back" operationally: disable
the gates (above) to stop further writes, then remediate created records/columns
manually in the target environment under change control. Use the correlation ids
in the audit payloads to scope exactly what was created.

## Safety

No fake recovery status, no uncontrolled live buttons, no secrets committed, no
environment assumptions, no silent target-org mutation. The panel is read-only;
all live execution stays behind the hard gates and the gated recovery console.

## Validation

- `npm test -- phase193I crm admin controls runbooks` — green.
- `npm run build` — green.
- `npm test -- crmGovernance noFakeProductionData releaseCandidateSnapshot` — green.
