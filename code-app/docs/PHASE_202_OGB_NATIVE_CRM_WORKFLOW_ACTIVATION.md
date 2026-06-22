# Phase 202 — OGB-Native CRM & Lending Workflow Activation

## Purpose

Activate the internally-built **OGB-native** CRM and Lending Workflow surfaces as
first-class live LOS surfaces. This is **not** an external Salesforce / nCino
connector project — no external connection is made, and no external brand copy
appears in user-facing surfaces. The product is OGB-native and legally distinct.

The previously-shown "preview / external-connection-disabled" posture is reframed
to honest **internal active** posture, while every unsafe write category remains
gated / fail-closed.

## What changed

### 1. Reframed user-facing copy (OGB-native, internal active)
- `src/crm/workspaceIntegration/crmWorkspacePreviewInputs.ts` — the shared posture
  source for banker / manager / executive surfaces now reports
  **"OGB CRM active — internal relationship intelligence (writeback gated)"** and
  **"Internal lending workflow active (writeback gated)"** instead of
  "Preview — external connection disabled".
- `src/banker/BankerCrmIntelligencePanel.tsx` — hero badges are now
  **"OGB CRM active"** / **"Writeback gated"** (was "Read-only" / "Preview-only");
  CRM and lending-workflow posture rows read as active internal, writeback gated.
- `src/crm/workspaceIntegration/CrmBankerWorkingSurface.tsx` — drill-through detail
  copy reframed from "external connection disabled" / "Preview-only" to active
  internal OGB CRM / lending-workflow posture, writeback gated; honest empty
  states preserved ("No relationship records linked yet").
- `src/admin/fullSystemLaunchReadinessModel.ts` — the CRM domain label is now
  **"OGB CRM / Relationship Command Center"** (no external brand).

The primary banker surfaces already rendered no external brand names (enforced by
existing component tests asserting Salesforce/nCino are absent from rendered
output); Phase 202 keeps that and removes the misleading external-disabled posture.

### 2. Internal activation status (Admin)
- `src/admin/ogbCrmWorkflowActivationModel.ts` — `deriveOgbCrmWorkflowActivation()`
  (pure, read-only, deterministic) reports internal CRM active / internal workflow
  active / certified pilot create status / writeback status / checklist generation
  status / borrower communication status / remaining blockers — derived from the
  existing gate constants. No SDK call, no write, no gate flip.
- `src/admin/OgbCrmWorkflowActivationPanel.tsx` — read-only admin panel rendering
  the activation status, mounted inside the already admin-gated `AdminWorkspace`
  (no new route, no entitlement widening, no action affordance).

## Activation posture

| Category | Status |
|---|---|
| Internal OGB CRM (read surfaces) | **Active** (read-only) |
| Internal lending workflow (read surfaces) | **Active** (read-only) |
| Certified New Deal create pilot | **Enabled** (pilot context only) |
| CRM writeback | **Gated** (`CRM_LIVE_PERSISTENCE_ENABLED = false`) |
| Checklist generation | **Gated** (`DOCUMENT_CHECKLIST_GENERATION_ENABLED = false`) |
| Borrower communications | **Gated** (`BORROWER_MESSAGING_ENABLED = false`) |
| Broad workflow writes | **Gated** (workflow derivers are read-only decision support) |

## Governance / safety

- **No external Salesforce / nCino connector dependency**; no external connection;
  no external brand copy in user-facing surfaces. Salesforce / nCino references
  remain only in internal governance docs/tests (competitive / legal context).
- **No fake / sample data** — surfaces hydrate from authorized internal context or
  show honest empty states; counts are honest zeros where nothing is linked.
- **No schema change, no migration, no secrets.**
- **No broad write enablement** — only the already-certified internal actions stay
  enabled (the pilot New Deal create; existing governed banker/workflow reads).
  Writeback, checklist generation, borrower communications, and broad workflow
  writes remain gated / fail-closed.
- **No permission bypass / no entitlement / route widening** — the admin activation
  panel inherits the admin route gate (`WorkspaceGate allowed=admin`) +
  `AdminProvider`; the admin console re-derives admin authorization and fails
  closed for non-admin users.
- Full-system launch readiness remains deterministic **CONDITIONAL_GO**.

## Verification commands

```bash
git diff --check
pnpm test -- OgbCrmWorkflowActivation phase202 BankerCrmIntelligencePanel CrmBankerWorkingSurface FullSystemLaunchReadiness releaseCandidateSnapshot
pnpm test
npm run build
git status --short
```
