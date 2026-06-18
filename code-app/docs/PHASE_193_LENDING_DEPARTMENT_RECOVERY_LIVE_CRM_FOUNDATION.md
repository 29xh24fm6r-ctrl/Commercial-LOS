# Phase 193 — Lending Department Recovery: Live CRM Foundation + Controlled Write Enablement

**Status:** Complete. The first **live-capable** CRM/lending foundation —
controlled schema apply, live record persistence, an operator recovery cockpit,
gated New Deal → CRM linkage, and deterministic audit — all defaulting to
**no-write / dry-run** and gated behind explicit hard gates. No app blast radius:
nothing is wired into routes/workspaces this phase (it is ready to mount).

**Branch:** `phase193-lending-department-recovery-live-crm-foundation`
(base: `master` after the Phase 189L line).

## Modules

| Module | Role |
|---|---|
| `crmSalesforceSpineLiveGates.ts` | Fail-closed evaluation of the schema-apply and live-persistence gates. |
| `crmSalesforceSpineAudit.ts` | Deterministic audit-payload builder (actor, target, action, source facts, correlation id, outcome, error). |
| `crmSalesforceSpineApplyOrchestrator.ts` | inspect → plan → dry-run apply → gated live apply (deterministic, idempotent, resumable). |
| `crmSalesforceSpinePersistenceAdapter.ts` | Live CRM record create/update over the guarded transport seam; structured outcomes; rejects missing required data. |
| `crmSalesforceSpineNewDealLinkage.ts` | Gated New Deal → provisional Account + Deal relationship linkage; `partial_success` on incomplete link. |
| `CrmSpineRecoveryConsole.tsx` | Operator recovery cockpit with an action model; live-apply button disabled unless gated. |

## Hard gates (live apply / live persistence)

Live apply requires ALL of:

- `CRM_LIVE_SCHEMA_APPLY_ENABLED === "true"` (injected string)
- `CRM_LIVE_PERSISTENCE_ENABLED === "true"` (injected string)
- operator acknowledgement `=== "APPLY_CRM_SPINE_SCHEMA"`
- `targetEnvironmentPresent === true`
- `operatorAuthorized === true`

Live record persistence requires the persistence master switch, acknowledgement
`PERSIST_CRM_SPINE_RECORDS`, environment present, and an authorized operator.
Gate values are **injected** — no module reads env/secrets, and the build-time
`CRM_LIVE_PERSISTENCE_ENABLED` boolean stays `false` (never flipped).

## Structured outcomes

- **Schema apply:** `dry_run_complete` · `created` · `no_changes_needed` ·
  `partial_success` · `blocked_gate_not_satisfied` · `failed_dataverse`.
- **Record persistence:** `created` · `updated` · `skipped_missing_required_data`
  · `blocked_gate_not_satisfied` · `failed_dataverse` · `partial_success` ·
  `dry_run`.

`partial_success` means a real Dataverse response was received for part of the
operation and a failure/skip for the rest — e.g. the Account linked but the Deal
relationship did not. The operation is **never** rolled forward silently and
success is **never** claimed without a real persistence response.

## Safety guarantees (pinned by tests)

- Default behavior is no-write: dry-run executes nothing; live paths block when
  the gate is unsatisfied or no executor/transport is wired.
- No fabricated records — missing required fields (incl. provenance
  `sourceFacts`) are rejected, never defaulted.
- No delete operation exists in any module; no `fetch`/SDK import; no `PublishXml`.
- No `CRM_LIVE_PERSISTENCE_ENABLED` flip, no schema/migration files, no fake
  sync-success strings, no borrower communications, no approval/decline action.
- No route/`App.tsx`/`WorkspaceGate`/workspace change; the console mounts nowhere
  this phase.

## App integration posture (this phase)

The foundation is live-capable but deliberately **not auto-wired**, to keep the
launch controls intact and avoid accidental mutation:

- **Banker/admin CRM surfaces:** unchanged. The persistence adapter exposes a
  read/write path a follow-up wires into the banker relationship panel so real
  Account/Contact/Coverage/Activity/Task/Health render when present and missing
  data stays visibly missing. No mock data is introduced.
- **Recovery console:** standalone; ready to mount into the existing admin
  surface. Mounting is a deliberate, separate step (the admin surface is
  currently read-only per `readOnlySurfaceGuard`).
- **New Deal create:** the existing governed create path is unchanged. The
  `linkNewDealToCrm` step is available for the create orchestration to call
  behind the persistence gate; with the gate off it is inert, preserving existing
  behavior.

## Operator runbook

1. **Inspect** — call the orchestrator/console inspect over a read-only live
   metadata snapshot. Review present/partial/missing tables and conflicts.
2. **Dry-run** — `runCrmSpineApply({ mode: 'dry-run-apply', ... })` and
   `persistCrmSpineRecords({ mode: 'dry-run', ... })`. Both execute nothing and
   report exactly what *would* happen.
3. **Live-apply** — only after all schema-apply gates + acknowledgement are
   satisfied AND a metadata executor is wired:
   `runCrmSpineApply({ mode: 'live-apply', gate, executor, ... })`. It is
   idempotent (already-present artifacts are skipped) and resumable (pass
   `alreadyAppliedTargets`).
4. **Verify** — re-inspect; confirm tables/columns/relationships are present and
   the runtime schema gate (`deriveCrmRuntimeSchemaGate`) reports `schemaReady`.
5. **Disable gates** — set the injected `CRM_LIVE_SCHEMA_APPLY_ENABLED` /
   `CRM_LIVE_PERSISTENCE_ENABLED` config values to anything other than `"true"`
   (or omit them) and drop the acknowledgement. Every live path immediately fails
   closed; no code change is required.
6. **`partial_success`** — inspect the per-step / per-record audit payloads
   (each has `correlationId`, `actor`, `outcome`, `error`). Re-run live-apply with
   `alreadyAppliedTargets` for the succeeded steps to complete the remainder;
   nothing already-present is re-created.

## Acceptance evidence

- Module tests: gates (fail-closed), audit (deterministic), orchestrator
  (dry-run/live/partial/idempotent), persistence (dry-run/missing-required/
  gated-live/created/updated/failed/partial), linkage (disabled/dry-run/linked/
  skipped/partial), recovery console (sections render, live-apply button gated).
- `phase193LendingDepartmentRecoveryContract.test.ts`: no destructive verbs/SDK/
  fetch, runtime no-write proofs, no flag flip, no schema/migration files, no
  route/App/Gate/workspace blast radius.
- Repo-wide `crmGovernance`, `noFakeProductionData`, `readOnlySurfaceGuard`, and
  `releaseCandidateSnapshot` scanners green.
- `npm run build` green.
