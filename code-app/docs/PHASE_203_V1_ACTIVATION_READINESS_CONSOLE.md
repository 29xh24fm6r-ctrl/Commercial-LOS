# Phase 203 — V1 Activation Readiness Console / Final Conditional-GO Gate

## Purpose

Add a final, deterministic, in-product surface that answers whether the OGB LOS
is ready for V1 release. It is read-only, derived only from existing gate
constants + models, and introduces no schema, migration, route, permission,
external connector, fake data, or new write capability.

## What changed

- **`src/shared/readiness/v1ActivationReadinessModel.ts`** —
  `deriveV1ActivationReadiness()` (pure, deterministic) reports the V1 release
  posture and per-category status, derived from existing constants and the Phase
  197 / 202 models.
- **`src/admin/V1ActivationReadinessPanel.tsx`** — a read-only admin panel that
  renders the posture (CONDITIONAL_GO), the active OGB-native surfaces, the
  pilot-enabled capability, the gated unsafe write categories, and the release
  safety posture. Action-free (no buttons, mutating links, form inputs, connector
  calls, write adapters, or live persistence).
- Mounted in **`src/workspaces/AdminWorkspace.tsx`** only (already admin-gated via
  `WorkspaceGate allowed=admin` + `AdminProvider`).
- Tests: model contract, component test, and a Phase 203 governance contract;
  release-snapshot pin.

## What did not change

No schema, migrations, Dataverse metadata, `power.config.json`, `.power`
generated output, `dist`, secrets, external connector registration, route /
entitlement logic, or write adapters. No new route, entitlement, or workspace
access rule. No broad write enablement, no new live CRM persistence, no borrower
communication sending, no checklist generation writes. No Salesforce / nCino
user-facing copy and no "preview-only" posture for active OGB-native surfaces.

## Gate derivation

| Field | Value | Source |
|---|---|---|
| `overallPosture` | `CONDITIONAL_GO` | `deriveFullSystemLaunchReadiness().recommendation` |
| `ogbCrmStatus` | `ACTIVE` | Phase 202 `deriveOgbCrmWorkflowActivation().internalCrmActive` |
| `internalLendingWorkflowStatus` | `ACTIVE` | Phase 202 `...internalWorkflowActive` |
| `newDealCreatePilot` | `ENABLED` | `BANKER_CREATE_PILOT_ENABLED === true` |
| `crmWriteback` | `GATED` | `CRM_LIVE_PERSISTENCE_ENABLED === false` |
| `borrowerCommunications` | `GATED` | `BORROWER_MESSAGING_ENABLED === false` |
| `checklistGeneration` | `GATED` | `DOCUMENT_CHECKLIST_GENERATION_ENABLED === false` |
| `broadWorkflowWrites` | `GATED` | workflow derivers are read-only decision support |
| `externalConnectors` | `NOT_REQUIRED` | OGB-native; no external dependency |
| `fakeSampleDataDependency` | `NOT_PRESENT` | honest empty states only |
| `schemaMigrationDependency` | `NOT_REQUIRED` | no schema/migration |
| `permissionRouteExpansion` | `NOT_PRESENT` | no route/entitlement widening |

## Release posture

**CONDITIONAL_GO.** The OGB-native CRM and lending workflow read surfaces are
active, the certified New Deal create pilot is enabled (pilot-only, controlled),
and every unsafe write category (CRM writeback, borrower communications,
checklist generation, broad workflow writes) remains gated / fail-closed. The
posture is materially launch-ready but not full GO while those categories remain
gated and final operator signoff (Phase 201) is pending.

## Conditional-GO / NO-GO explanation

- **CONDITIONAL_GO** (current): foundation active + pilot enabled, but one or more
  unsafe write categories remain gated and final signoff is pending. This is the
  honest, deterministic current posture.
- **GO** would require the full-system launch decision (Phase 201) to flip — all
  required domains ready, complete evidence, and final operator signoff — none of
  which this read-only console performs.
- **NO_GO** would be reported if the full-system launch model detected a blocker
  or a forbidden condition (e.g. an unsafe gate flipped on, or fake data). This
  console only reflects that determination; it never forces a posture.

The model is deterministic: repeated calls return an equal result, derived only
from committed constants.

## Verification commands

```bash
pnpm test -- v1ActivationReadiness V1ActivationReadiness phase203 releaseCandidateSnapshot
pnpm test
npm run build
git diff --check
git status --short
```
