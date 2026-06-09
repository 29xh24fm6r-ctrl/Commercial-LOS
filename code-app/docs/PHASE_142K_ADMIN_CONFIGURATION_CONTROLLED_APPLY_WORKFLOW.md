# Phase 142K — Admin Configuration Controlled Apply Workflow (No Schema Mutation)

> **What this is.** A governed model of how a FUTURE admin-approved configuration
> change would move through review → validation → approval → apply-readiness →
> controlled apply plan → dry-run preview — **while applying nothing.** It does
> NOT apply configuration, mutate platform registries, edit templates, change
> workflow routes, enable integrations, widen permissions, register routes, create
> custom fields, mutate Dataverse schema, write to Dataverse, or execute workflow
> changes. **Generate apply plans. Do not apply them.**

## 1. Purpose

The system now has proposals (142G) and persistence seams (142J). The next safe
step is to model the controlled apply process without applying anything — giving
leadership and admins a clear path for future configuration governance while
preserving the bank-safe posture.

Core principle: **generate apply plans; do not apply them.**

## 2. Prerequisites

- **Phases 142A–142J** — convergence layer through the disabled persistence
  adapter. Existing governance keeps admin configuration persistence, write, and
  apply disabled.

## 3. What this phase adds

| File | Role |
|---|---|
| `adminConfigurationApplyTypes.ts` | Apply modes, statuses, plan/step, readiness, result types |
| `deriveAdminConfigurationApplyReadiness.ts` | Apply readiness (validForApply always false) |
| `buildAdminConfigurationApplyPlan.ts` | Preview-only / blocked plan builder (redacted) |
| `createAdminConfigurationControlledApplyEngine.ts` | Engine (attemptApply always blocked) |
| `adminConfigurationApplyFeatureFlags.ts` | Fail-closed flags (execution + dangerous pinned false) |
| `deriveAdminConfigurationApplyWorkflow.ts` | Apply workflow roll-up (no "apply now") |
| `AdminConfigurationApplyPreviewPanel.tsx` | Dry-run-only read-only preview panel |

Only an `approved_not_applied`, validation-clean, **safe-metadata** proposal
becomes `dry_run_ready` and produces a preview plan with redacted before/after
summaries. Schema/custom-field, route-registration, integration, permission, and
workflow proposals produce blocked plan steps. `applied` and `mutated` are pinned
false everywhere; there is no applied / deployed / published / activated /
executed / live status; and `attemptApply` is always blocked.

## 4. What remains disabled

- **Actual apply** — none; `attemptApply` always returns blocked.
- **Deploy / publish / activate** — none.
- **Schema mutation** — none.
- **Custom fields** — none.
- **Route registration** — none.
- **Integration enablement** — none.
- **Permission widening** — none.
- **Workflow execution** — none.
- **Dataverse writes** — none; no persistence write from the apply engine.

## 5. Controlled apply future path

1. **Policy approval** — documented institutional approval for the change class.
2. **Operator-generated implementation spec** — a governed spec produced from the
   preview plan (never auto-applied from the UI).
3. **Test gates** — full build + governance + acceptance gates green.
4. **Explicit commit / review** — a human, reviewed commit performs the change.

## 6. Next recommended phase

**Phase 142L — Integration transport proof-of-concept harness, fake transport
only** — prove the 142F integration adapter seam with a fake transport, with no
real provider call.
