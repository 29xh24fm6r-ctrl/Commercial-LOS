# Phase 193J — Salesforce CRM V1 Certification

**Status:** Certification PR for the Salesforce-like CRM V1 build (Phases
193A–193I). **Branch:** `phase193j-salesforce-crm-v1-certification`.
**Depends on:** 193A–I (stacked, in order).

## Release-candidate matrix

| Capability | Module(s) | PR | Status |
|---|---|---|---|
| Live gates + schema apply orchestrator (inspect/plan/dry-run/live) | `crmSalesforceSpineLiveGates.ts`, `crmSalesforceSpineApplyOrchestrator.ts` | 193A | ✅ gated |
| Live persistence adapter + audit (8 direct mappings; 3 modeled non-persisted entities) | `crmSalesforceSpinePersistenceAdapter.ts`, `crmSalesforceSpineAudit.ts` | 193B | ✅ gated |
| Operator recovery console | `CrmSpineRecoveryConsole.tsx` | 193C | ✅ |
| Account / Contact / Coverage surfaces | `crmAccountViewModel.ts`, `CrmAccountSurfaces.tsx` | 193D | ✅ |
| Activities / Tasks / Timeline | `crmActivityTaskModel.ts`, `CrmActivityTimeline.tsx` | 193E | ✅ |
| Relationship health + next actions | `crmRelationshipHealthModel.ts`, `CrmRelationshipHealthCard.tsx` | 193F | ✅ |
| New Deal → CRM linkage (gated) | `crmSalesforceSpineNewDealLinkage.ts` | 193G | ✅ gated |
| Manager / Team / Executive rollups | `crmRelationshipRollups.ts`, `CrmRollupCards.tsx` | 193H | ✅ |
| Admin controls + runbooks | `crmAdminControlModel.ts`, `CrmAdminControlPanel.tsx` | 193I | ✅ |

## Certification claims (pinned by `phase193JSalesforceCrmV1Certification.test.ts`)

- Account/Contact/Coverage surfaces exist; Activity/Task/Timeline exists;
  Relationship Health exists; New Deal CRM linkage exists behind gates; live
  schema apply exists behind gates; live persistence exists behind gates; admin
  controls exist; rollups exist.
- **No fake data** — surfaces render missing data as missing; no fabricated
  accounts/contacts/activities/tasks/source facts.
- **No fake sync** — no module emits a fabricated "synced/updated" success;
  success is only reported on a real (or injected-test) Dataverse response.
- **No fake approval** — relationship health is rules-based with no
  approval/credit-decision/AI-odds language.
- **No borrower comms** — no email/SMS/outreach send primitives.
- **No entitlement bypass** — rollups fail closed when the viewer is not
  entitled; the executive rollup is aggregate-only.
- **No uncontrolled live writes** — every live path defaults to no-write and
  blocks unless the hard gates + acknowledgement + executor/transport are present.
- **Build green.**

## Default-safety proof (runtime, in the certification test)

dry-run apply executes nothing · live apply blocks with no gate · dry-run persist
no write · live persist blocks with no gate · new-deal linkage inert with no gate
· health `unknown` with no evidence · rollups fail closed when not entitled ·
admin controls `gates-closed` by default · account empty state with no account ·
timeline empty (not fabricated).

## Known gaps (V1)

- The CRM surfaces, recovery console, admin panel, and rollups are **not mounted
  into any route/workspace** this build (zero app blast radius). Mounting into
  the admin/banker surfaces is a deliberate follow-up.
- The New Deal linkage module is standalone; wiring it into the governed New Deal
  create orchestration is a follow-up that edits the create path explicitly.
- Task records have no allow-listed Dataverse table yet — task persistence is
  honestly disabled (surfaced as non-persistable), pending a `cr664_crmtask`
  allow-list extension.
- The live metadata executor and live Dataverse transport are injected at enable
  time and are never wired by default; live schema apply / persistence remain
  inert until an operator wires them behind the gates.

## Operator checklist (before any live action)

1. Inspect (read-only) and review missing/conflicting schema.
2. Dry-run apply + dry-run persist; confirm `executed: false`.
3. Confirm environment target is present and correct.
4. Set `CRM_LIVE_SCHEMA_APPLY_ENABLED="true"`, `CRM_LIVE_PERSISTENCE_ENABLED="true"`,
   provide the exact acknowledgement, ensure an authorized operator + correlation id.
5. Wire the metadata executor / transport.
6. Live apply (idempotent, resumable); verify; handle any `partial_success` via
   the audit correlation ids.
7. To stand down: disable the gates (config flip) — every live path fails closed.

## Validation

- `npm test -- phase193 crmSalesforceSpine recovery newDeal audit governance account contact coverage activity task timeline relationship health admin releaseCandidateSnapshot` — green.
- `npm run build` — green.
- `npm test -- crmGovernance noFakeProductionData readOnlySurfaceGuard releaseCandidateSnapshot` — green.
