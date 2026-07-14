# LoanDealStageAuthorityPlugin — deployment

**Status: NOT built, registered, or deployed.** This project was authored in a session with no
`dotnet` SDK, no Power Platform CLI (`pac`), and no Dataverse credentials — everything below has
been reviewed by inspection for correctness, not verified by a compiler or a live registration.
Budget real time to fix whatever the review missed before trusting this in production.

## What this is

A synchronous PreOperation plugin on `Update` of `cr664_loandeal`, filtered to
`cr664_stagereference` and `cr664_statusreference`. It enforces the same credit-authority rule as
`src/workflow/creditApprovalAuthority.ts` — approval limit / credit committee membership / override
authority — but server-side, so a direct Web API call, data import, Power Automate flow, or any
other integration writing straight to `cr664_loandeal` cannot bypass the application's approval
gate the way it currently can (see `docs/LOAN_WORKFLOW_INDEPENDENT_AUDIT_2026-07-14.md`, finding C1).

## Before you build

1. **Confirm the two `TODO CONFIRM` items in `LoanDealStageAuthorityPlugin.cs`** against the live
   `CommercialLendingLOS` solution:
   - The schema/logical name of the lookup attribute on `cr664_loanrequestprofile` that references
     `cr664_loandeal` (the code currently assumes `cr664_loandeal` — verify, don't trust).
   - Confirm `cr664_dealstagereferences.cr664_code` / `cr664_dealstatusreferences.cr664_code` are
     the right fields carrying the canonical stage/status codes (`CREDIT_APPROVAL`, `COMMITMENT`,
     etc.) — this one was cross-checked against the repo's own generated models
     (`src/generated/models/Cr664_dealstagereferencesModel.ts`) and should be correct, but the
     live schema is the source of truth, not the repo.
2. Confirm the `Microsoft.CrmSdk.CoreAssemblies` NuGet version in the `.csproj` is current — it was
   set to a plausible recent version without being able to check NuGet from the authoring session.

## Build

```powershell
cd dataverse-plugins/CommercialLendingLOS.Plugins
dotnet restore
dotnet build -c Release
```

This produces `bin/Release/net462/CommercialLendingLOS.Plugins.dll`. Fix any compile errors the
review above missed — this file was never run through a compiler.

## Register (Plugin Registration Tool)

1. Install the Plugin Registration Tool: `dotnet tool install --global Microsoft.PowerApps.CLI` (for
   `pac`) or download the classic Plugin Registration Tool (`PluginRegistration.exe`) via NuGet
   package `Microsoft.CrmSdk.XrmTooling.PluginRegistrationTool`.
2. Connect to the target org (`org3a57b8d4.crm.dynamics.com`, solution `CommercialLendingLOS`).
3. Register a new assembly: point at `CommercialLendingLOS.Plugins.dll`. Isolation mode: **Sandbox**
   (do not register as unsandboxed unless your organization's policy explicitly requires it).
4. Register a new step on `LoanDealStageAuthorityPlugin`:
   - **Message**: `Update`
   - **Primary Entity**: `cr664_loandeal`
   - **Filtering Attributes**: `cr664_stagereference`, `cr664_statusreference` (step only fires
     when one of these is part of the update — matches the plugin's own defensive re-check)
   - **Stage**: **PreOperation** (synchronous) — this is load-bearing. PostOperation or
     asynchronous registration would let the write land before/regardless of this check.
   - **Execution Mode**: Synchronous
   - **Images**: register a **Pre-Image** named exactly `PreImage` (the code looks up this alias
     literally) with attributes `cr664_stagereference`, `cr664_statusreference`, `cr664_amount`.

## Alternative: `pac plugin push` (newer CLI-based flow, if your org supports it)

```powershell
pac plugin init   # first time only, if not already a plugin package project
pac plugin push --pluginPackage dataverse-plugins/CommercialLendingLOS.Plugins
```

`pac plugin push` handles both assembly registration and (for simple cases) step registration from
a manifest; consult current `pac` docs for your CLI version, since step/image configuration via
this path may still require the classic tool or a `pac plugin` step-registration file — this
session could not verify current `pac plugin` command behavior (no `pac` CLI available).

## Verify after registering

- Manually update a test deal's `cr664_stagereference` while it's in `CREDIT_APPROVAL`, via a
  direct Web API call (bypassing the app), as a test user who is NOT a credit committee member —
  confirm the API call is rejected with the plugin's denial message, not silently accepted.
- Repeat as a test user who IS a credit committee member within their approval limit — confirm the
  write succeeds.
- Confirm the plugin does NOT fire (no error, normal write) for stage/status changes unrelated to
  exiting `CREDIT_APPROVAL` — e.g. advancing INTAKE → UNDERWRITING should be completely unaffected.

## Anything still not deployed after you follow this doc

Note it in your own deployment log — this file only covers what the deploying engineer needs to
do; it can't confirm the outcome from here.
