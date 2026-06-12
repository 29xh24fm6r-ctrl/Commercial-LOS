# Phase 169C -- Admin New Deal Intake Blocker

Date: 2026-06-12
Baseline: 6a3be00 (Phase 169B). V1.0 tag v1.0.0-controlled-pilot at faf26d6.

## Case Outcome: CASE B (deal-create SDK exists; Stage/Status source missing)

`Cr664_loandealsService.create` exists in the generated SDK, but
`cr664_loandeal` create requires non-optional
`cr664_StageReference@odata.bind` and `cr664_StatusReference@odata.bind`
lookups whose target reference table is NOT registered. There is no safe,
deterministic, GUID-free way to resolve a default Stage/Status, so NO
create is enabled. This phase adds a blocker/preview surface only.

This is unchanged from Phase 163; Phase 169C makes the blocker
operationally clear inside the Admin Operations Console and lays out the
exact path to safe creation.

## Investigation (re-confirmed)

- No generated `Cr664_stagereferences*` / `Cr664_statusreferences*` model
  or service exists under `src/generated/`.
- No stage/status reference table is registered in `power.config.json`
  database references or `.power/schemas/appschemas/dataSourcesInfo.ts`.
- No `.power/schemas/dataverse/stagereference*.Schema.json` exists.
- `Cr664_loandealsModel.ts` still declares both binds as required
  (non-optional) on create.
- `NOT_WIRED` still carries `new-deal-create` (the + New Deal control
  stays disabled).

## Exact Blocker

> Stage/Status reference data source registration is missing.
> cr664_loandeal create requires cr664_StageReference and
> cr664_StatusReference lookup binds, but the target reference table is
> not registered (no generated model/service, not in power.config.json /
> dataSourcesInfo, no schema file). No default Stage/Status can be
> resolved without hardcoding a GUID, which is prohibited (Phase 163).

## Required Future Fields

The panel lists the fields a future governed intake would collect and
maps each to its `cr664_loandeal` column / bind:

| Field | Maps to | Required | State |
| --- | --- | --- | --- |
| Deal Name | cr664_dealname | Yes | Ready |
| Client / Borrower | cr664_Client@odata.bind | No | Ready |
| Assigned Banker | cr664_AssignedBanker@odata.bind | Yes | Ready |
| Amount | cr664_amount | No | Ready |
| Stage | cr664_StageReference@odata.bind | Yes | Blocked |
| Status | cr664_StatusReference@odata.bind | Yes | Blocked |
| Product Type | cr664_ProductTypeReference@odata.bind | No | Ready |
| Loan Structure | cr664_LoanStructureTypeReference@odata.bind | No | Ready |
| Pricing | cr664_PricingTypeReference@odata.bind | No | Ready |

Only Stage and Status are blocked-by-reference; they map to the required
lookup binds that cannot be resolved today.

## Stage/Status Data-Source Registration Checklist

1. Identify the live target table(s)/entity sets behind
   `cr664_StageReference` and `cr664_StatusReference` from environment
   metadata (not guessed).
2. Register the reference table(s) in `power.config.json` database
   references and `.power/schemas/appschemas/dataSourcesInfo.ts`, with
   their `.power/schemas/dataverse/<table>.Schema.json`.
3. Regenerate the SDK / schema so a typed `Cr664_<reference>Service` and
   model exist under `src/generated/`.
4. Add a fail-closed default resolver: resolve exactly one default Stage
   and one default Status by stable code/name/order; fail closed on zero
   or multiple matches; no hardcoded GUIDs.
5. Only then enable a governed, audited create (admin/banker write
   entitlement, the two resolved binds, a cr664_AuditEvent, a typed
   outcome union, and payload-discipline tests).

Steps 1-3 are environment/schema/SDK-regeneration work outside this app's
allowed delta for V1.0.

## Why No Create Was Enabled

`NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED = false`. Enabling create would
require either a registered Stage/Status reference source (absent) or a
hardcoded GUID (prohibited) or a fabricated default reference (prohibited).
None is acceptable, so the "Create deal" action is a disabled placeholder
and the existing + New Deal button remains disabled.

If a resolver unexpectedly became available, a governed audited create
would still be deferred to a separate phase (169C2), not enabled here.

## Guardrails Honored

- No + New Deal live wiring; no deal created.
- No hardcoded Stage/Status GUIDs (pinned by source + model tests).
- No schema / migrations / Dataverse records.
- No permission bypass or widening; admin-gated by the existing route +
  console gate.
- No external HTTP / fetch / Graph (pinned by source tests).
- No portfolio / CRM write enablement touched.
- No fake deals / stages / statuses / default references.

## Files Changed

- `src/admin/adminNewDealIntakeModel.ts` -- static blocker/field/checklist model.
- `src/admin/NewDealIntakePanel.tsx` -- blocker/preview panel.
- `src/admin/AdminOperationsConsole.tsx` -- mounts the panel.
- `src/admin/adminNewDealIntakeModel.test.ts`,
  `src/admin/NewDealIntakePanel.test.tsx` -- tests.
- `src/shared/governance/releaseCandidateSnapshot.test.ts` -- doc pin.
- `docs/PHASE_169C_ADMIN_NEW_DEAL_INTAKE_BLOCKER.md` -- this doc.

## Route Delta

0. The panel renders inside the existing `/workspaces/admin` route. No
router file changed; no new route added.

## Validation

- `npm test -- Admin admin NewDeal releaseCandidateSnapshot`: passed.
- `npm test`: passed (full suite).
- `npm run build`: passed (existing Vite chunk-size warning only).

## Deploy / Tag / Schema / Write

No deploy. No tag created or moved (`v1.0.0-controlled-pilot` stays at
`faf26d6`). No schema, migration, or Dataverse record created. No live
write enabled. No permission widened.
