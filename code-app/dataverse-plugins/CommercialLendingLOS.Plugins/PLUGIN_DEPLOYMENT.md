# LoanDealGovernedTransitionPlugin — deployment

**Status (updated 2026-07-23, final-seven-workstreams Workstream 1): built and unit-tested; still
NOT registered or deployed against any live Dataverse environment.** A working `dotnet` SDK became
available in the session that ran Workstream 1 — `dotnet build -c Release` now succeeds cleanly (0
warnings, 0 errors), and a new xUnit test project
(`dataverse-plugins/CommercialLendingLOS.Plugins.Tests/`, 41 tests) exercises the compiled plugin
against a hand-rolled in-memory Dataverse fake, covering every transition class in
`CANONICAL_TRANSITION_POLICY_CONTRACT.md` plus the credit-authority sub-rules. That pass also found
and fixed two real hardening gaps (a dangling/unresolvable stage or status reference could
previously surface a raw platform exception instead of a safe fail-closed denial; a plain
status-only change that wasn't literally DECLINED/WITHDRAWN was never checked for resolving to any
canonical status at all). See `docs/operator-runbooks/DATAVERSE_GOVERNANCE_PLUGIN_DEPLOYMENT.md`
for the full operator runbook (prerequisites, exact registration steps, service-account
requirements, smoke test, rollback). Registration itself still requires a live Dataverse admin
action this sandbox cannot perform — nothing below should be read as "deployed."

This document supersedes the prior `LoanDealStageAuthorityPlugin` deployment notes — that plugin
(narrowly scoped to the CREDIT_APPROVAL → COMMITMENT authority rule) has been deleted and folded
into this one, which enforces the full canonical transition policy. See
`docs/governance/CANONICAL_TRANSITION_POLICY_CONTRACT.md` for the policy itself,
`docs/governance/ADR_001_PLATFORM_ENFORCED_CREDIT_WORKFLOW_GOVERNANCE.md` for why this
architecture, and `docs/governance/DEPLOYMENT_AND_ROLLBACK_PLAN.md` for the full sequencing this
file is one step of.

## What this is

A plugin registered **twice** on `Update` of `cr664_loandeal`, filtered to `cr664_stagereference`
and `cr664_statusreference`:

1. **Stage 10 (Pre-validation)** — evaluates the full policy against the pre-image; on rejection,
   writes a `cr664_auditevents` row (outcome = Blocked) and throws. This is the step that gives
   rejected attempts a durable audit trail even though the triggering write never commits.
2. **Stage 20 (Pre-operation)** — re-evaluates the same policy against the freshest pre-image
   (inside the write's own transaction) and throws on rejection with no further audit write. This
   is the authoritative gate that actually prevents the invalid write from persisting.

It enforces: the 7-stage adjacency graph (no skips), terminal-status lock (DECLINED/WITHDRAWN/
BOARDED accept no further transition), the CREDIT_APPROVAL → COMMITMENT credit-authority rule
(approval limit / credit-committee membership / override authority), and — once the reason column
below is provisioned and `RequireReasonFieldToEnforce` is flipped `true` — non-empty reason
enforcement for RETURN/DECLINE/WITHDRAW.

## Before you build

1. **Confirm every `TODO CONFIRM` in `LoanDealGovernedTransitionPlugin.cs`** against the live
   `CommercialLendingLOS` solution — the singular entity logical name (`cr664_loandeal`), the
   `cr664_loanrequestprofile.cr664_deal` lookup, and the `cr664_platformuser` singular logical name
   used to resolve `cr664_ChangedBy`.
2. **Confirm the audit option-set integer values** (`AuditEntityTypeLoanDeal = 788190000`,
   `AuditEventCategoryLifecycle = 788190002`, `AuditEventTypeStageChange = 788190000`,
   `AuditEventTypeStatusChange = 788190001`, `AuditOutcomeBlocked = 788190002`) against the live
   `cr664_auditevents` option-set metadata — these were taken from this repo's own generated model
   (`src/generated/models/Cr664_auditeventsModel.ts`), not a live metadata browse.
3. **Provision the reason column** (only needed before flipping `RequireReasonFieldToEnforce`):
   run `scripts/dataverse/create-governed-transition-reason-field.ps1` (dry-run by default,
   `-Apply` creates the column). See `src/deals/governedTransitionReasonSchema.ts` for the exact
   column name and rationale.
4. Confirm the `Microsoft.CrmSdk.CoreAssemblies` NuGet version in the `.csproj` is current.

## Build

```powershell
cd dataverse-plugins/CommercialLendingLOS.Plugins
dotnet restore
dotnet build -c Release
```

This produces `bin/Release/net462/CommercialLendingLOS.Plugins.dll`. Fix any compile errors the
review above missed — this file was never run through a compiler.

## Register (Plugin Registration Tool)

1. Install the Plugin Registration Tool (`pac` or the classic `PluginRegistration.exe` via the
   `Microsoft.CrmSdk.XrmTooling.PluginRegistrationTool` NuGet package).
2. Connect to the target org (`org3a57b8d4.crm.dynamics.com`, solution `CommercialLendingLOS`).
3. Register a new assembly: point at `CommercialLendingLOS.Plugins.dll`. Isolation mode:
   **Sandbox**.
4. Register **two** steps on `LoanDealGovernedTransitionPlugin`, both on `Update` /
   `cr664_loandeal`, filtered to `cr664_stagereference, cr664_statusreference`:
   - **Step A** — **Stage: Pre-validation**, **Execution Mode: Synchronous**. Register a
     **Pre-Image** named exactly `PreImage` with attributes
     `cr664_stagereference, cr664_statusreference, cr664_amount, cr664_governedactionreason`.
   - **Step B** — **Stage: Pre-operation**, **Execution Mode: Synchronous**, same filtering
     attributes, same `PreImage` pre-image configuration.
   - Both stages are load-bearing — see the ADR for why pre-validation alone is not sufficient
     (it runs before locking, so a narrow race window between it and pre-operation exists) and why
     pre-operation alone would lose the durable rejection-audit trail (its writes roll back with
     the aborted transaction).

## Verify after registering

Run every scenario in `docs/governance/LIVE_OPERATOR_CERTIFICATION_SCRIPT.md` — it is the
authoritative post-registration verification script for this initiative, superseding the narrower
verification checklist a prior version of this document carried. At minimum, before considering
this "done":

- A direct Web API stage-skip (e.g. INTAKE → CREDIT_APPROVAL) is rejected with a specific reason,
  and a `cr664_auditevents` row (outcome Blocked) exists for it.
- A direct Web API write attempting to modify a DECLINED/WITHDRAWN/BOARDED deal's stage or status
  is rejected.
- A non-committee, non-override banker cannot move a deal out of CREDIT_APPROVAL; a
  committee-member banker within their limit can.
- A stage/status write unrelated to a governed transition (e.g. this row's `cr664_amount` alone)
  is completely unaffected — the plugin does not fire.
- Two near-simultaneous conflicting transition attempts on the same deal: the first commits, the
  second is rejected against the deal's new true state (see `CONCURRENCY_PROTECTION.md`).

## Rollback

See `docs/governance/DEPLOYMENT_AND_ROLLBACK_PLAN.md`. Summary: disable (or delete) either plugin
step via the Plugin Registration Tool to return to today's client-only enforcement instantly — no
schema change, no client redeploy required to roll back.

## Anything still not deployed after you follow this doc

Note it in your own deployment log — this file only covers what the deploying engineer needs to
do; it can't confirm the outcome from here.
