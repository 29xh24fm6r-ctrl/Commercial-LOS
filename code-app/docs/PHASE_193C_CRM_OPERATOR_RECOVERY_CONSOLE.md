# Phase 193C — CRM Operator Recovery Console

**Status:** Complete. Upgrades the passive Phase 189L readiness console into an
operator recovery cockpit with an action model. Read-mostly: no write happens in
the console itself; actions dispatch via callback props the host wires to the
gated orchestrator.

**Branch:** `phase193c-crm-operator-recovery-console`.
**Depends on:** PR 193A (orchestrator + gates).

## Delivered

- `src/crm/CrmSpineRecoveryConsole.tsx`.

## Shows

inspect status · schema plan status · dry-run apply status · live apply
eligibility · live persistence gate status · missing gates · acknowledgement
requirement (`APPLY_CRM_SPINE_SCHEMA`) · last operation outcome · blocked reasons
· partial-success details · audit correlation id.

## Actions

Run inspect · Generate plan · Run dry-run apply · Prepare live apply · Execute
live apply. The **Execute live apply** button stays disabled unless the
schema-apply gate is fully satisfied; clicking a disabled button is inert (no
callback fires).

## Safety

Visible operator controls only — no hidden writes, no automatic live apply, no
fabricated "synced" state or success copy, no borrower communications, no
approval language. Not mounted into any route/workspace this phase.

## Validation

- `npm test -- phase193C crm recovery console operator` — green.
- `npm run build` — green.
- `npm test -- crmGovernance noFakeProductionData readOnlySurfaceGuard releaseCandidateSnapshot` — green.
