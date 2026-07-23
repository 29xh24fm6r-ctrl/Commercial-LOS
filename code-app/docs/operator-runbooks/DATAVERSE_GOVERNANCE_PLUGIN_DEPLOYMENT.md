# Operator Runbook — Dataverse Governance Plugin Registration

**final-seven-workstreams, Workstream 1.** This is the exact, ordered operator runbook for taking
`LoanDealGovernedTransitionPlugin` from "built and unit-tested" to "registered and enforcing
server-side" against `https://org3a57b8d4.crm.dynamics.com` (environment
`5f2d77a5-de50-edeb-9d74-5b2400a2320d`). None of the steps below can be executed from this
sandbox — no live Dataverse credentials, no Power Platform CLI session, no Plugin Registration Tool
connection exist here. Every step is an operator action for Matthew (`mpaller@oldglorybank.com`)
from `C:\Users\MatthewPaller\projects\powerapp-project\code-app`.

This runbook is the single consolidated deliverable the final-seven-workstreams spec asked for; it
does not replace the existing `dataverse-plugins/CommercialLendingLOS.Plugins/PLUGIN_DEPLOYMENT.md`
(narrower, plugin-authoring-focused) or `docs/governance/DEPLOYMENT_AND_ROLLBACK_PLAN.md` (the
overall sequencing this is one step of) — read all three; this one adds the service-account and
secure/unsecure-configuration detail the other two do not cover, plus a controlled bypass-attempt
smoke test with exact expected failure text.

## What changed this pass (code-side, already done, no operator action needed)

- The plugin now **compiles** (`dotnet build -c Release`, 0 warnings/0 errors) — a working `dotnet`
  SDK was available in this session for the first time.
- A new xUnit test project, `dataverse-plugins/CommercialLendingLOS.Plugins.Tests/` (41 tests),
  exercises the compiled `Execute()` method against a hand-rolled in-memory Dataverse fake. All 41
  pass.
- That testing pass found and fixed two real hardening gaps (both now covered by regression tests):
  1. `ResolveStage`/`ResolveStatusCode` previously let a dangling/unresolvable lookup (e.g. a
     deleted stage/status reference row) throw a raw, uncaught platform exception instead of
     failing closed with the plugin's own safe message. Fixed: both now wrap their `Retrieve` call
     in try/catch and return `null` (fail-closed) on any exception.
  2. A plain status-only change (touching `cr664_statusreference` without also touching
     `cr664_stagereference`) that was **not** literally DECLINED or WITHDRAWN was allowed through
     unconditionally — including a dangling/malformed status reference — because the code never
     checked that the new value resolved to any canonical status at all. Fixed: the status-only
     branch now denies with "target status could not be resolved..." if `toStatusCode` is null.
- Neither fix changes any previously-passing behavior; the plugin's canonical stage/status
  vocabulary, terminal-status set, and credit-authority rule are unchanged (confirmed by
  `src/workflow/governancePluginParityFixture.test.ts`, still 6/6 passing against the same
  literals).
- A `bin/Release/net462/CommercialLendingLOS.Plugins.dll` checksum from this pass's build, for your
  own before/after comparison once you rebuild on your machine:
  ```
  SHA-256: 8bb0b2d41ee15e304596c04c279ae5b5c80d8c5b1aa2d9db2e756199510c06bd
  ```
  Rebuild fresh on your machine before registering rather than trusting this file transferred out of
  band — this checksum is only useful to confirm your own rebuild is deterministic/matches, not as a
  substitute for building it yourself.

## Prerequisite tools (operator machine)

1. **.NET SDK** capable of building a `net462`-targeted class library (verified in this pass:
   .NET 8 SDK builds it fine via the auto-restored `Microsoft.NETFramework.ReferenceAssemblies`
   package — no separate .NET Framework Developer Pack install should be required, but if your
   machine's `dotnet build` fails on this project, install the .NET Framework 4.6.2 Developer Pack
   as a fallback).
2. **Power Platform CLI (`pac`)**, authenticated to the target environment:
   ```powershell
   pac auth create --url https://org3a57b8d4.crm.dynamics.com
   pac org who
   ```
3. **Plugin Registration Tool** — either `pac plugin push` (newer, scriptable) or the classic
   `PluginRegistration.exe` (via the `Microsoft.CrmSdk.XrmTooling.PluginRegistrationTool` NuGet
   package, for the interactive UI with clearer step/image configuration). This runbook gives exact
   values for either tool.

## Service account / registration identity requirements

- The identity used to **register** the plugin (via `pac` or the Plugin Registration Tool) needs
  System Administrator or System Customizer role in the target environment — plugin registration is
  a solution-customization action, not a runtime data action.
- The plugin itself runs **as the initiating user** at request time (`context.InitiatingUserId`,
  via `CreateOrganizationService(context.InitiatingUserId)`) — it does **not** need a separate
  service-account identity or impersonation. It reads `cr664_banker`, `cr664_dealstagereferences`,
  `cr664_dealstatusreferences`, `cr664_loanrequestprofile`, `systemuser`, and `cr664_platformuser`
  rows, and writes `cr664_auditevents` rows, all as whichever real user's write triggered it — this
  is intentional (the audit trail must reflect who actually acted, per
  `ADR_001_PLATFORM_ENFORCED_CREDIT_WORKFLOW_GOVERNANCE.md`).
- Confirm every interactive/API user whose writes should be governed (bankers, managers, any
  integration/service principal that writes `cr664_loandeal` stage/status directly) has **read**
  access to the five tables above — a user who cannot read `cr664_dealstagereferences`, for example,
  will have every transition fail closed with the "could not be resolved" message, which is a
  security-floor-preserving failure mode but a confusing support ticket if unexpected. Confirm
  security-role read access before registering, not after the first support escalation.

## Secure / unsecure configuration

This plugin takes **no configuration** (no secure or unsecure config string) — every value it needs
is either a compile-time constant (schema names, canonical codes, audit option-set integers) or
resolved live via `IOrganizationService` at request time. Leave both the secure and unsecure
configuration fields **blank** when registering the assembly/steps. If a future change introduces a
literal that should be operator-configurable (e.g. a different reason-column name per environment),
add it as unsecure config then and update this section — do not add configuration speculatively now.

## Before you build

Everything already reviewed and confirmed consistent in this pass:
- `TargetFramework=net462` in the `.csproj` — correct; do not change to a modern TFM (Dataverse's
  sandbox CLR host only accepts classic .NET Framework plugin assemblies).
- `SignAssembly=false` — correct for Sandbox isolation mode (the default and required mode for this
  registration; Full Trust / unsigned-strong-name concerns do not apply here).
- Canonical stage codes, status codes, terminal-status set, and schema-name constants — all
  confirmed to match `src/workflow/stageOrderingContract.ts` / `statusReferenceContract.ts` /
  `governancePluginParityFixture.test.ts` (still passing, unchanged by this pass).

Still genuinely unconfirmed against the **live** org (carried over from the prior review, not
resolved by this pass since it requires live metadata access this sandbox doesn't have):
- The audit option-set integer values (`788190000`/`788190002`/`788190001`) — taken from this repo's
  generated model, not a live metadata browse. Confirm via the maker portal's `cr664_auditevents`
  option-set editor before registering; a mismatch here would misclassify audit rows (wrong
  category/type), not silently break the governance gate itself (the Deny/throw happens regardless
  of whether the audit write succeeds).
- `cr664_loanrequestprofile.cr664_deal` lookup target — the plugin comment notes this was verified
  live by a predecessor plugin; re-confirm it still holds before registering, since a schema drift
  here would silently disable the request-profile amount cross-check (it fails soft, per
  `TryResolveRequestProfileAmount`'s own try/catch — a broken lookup name degrades to "use the
  deal's own `cr664_amount` only," not a hard failure).

## Build

```powershell
cd dataverse-plugins\CommercialLendingLOS.Plugins
dotnet restore
dotnet build -c Release
```

Also run the test project before registering anything, to confirm your local toolchain reproduces
this pass's green result:

```powershell
cd ..\CommercialLendingLOS.Plugins.Tests
dotnet test
```

Expect `Passed! - Failed: 0, Passed: 41, Skipped: 0, Total: 41`. If anything fails on your machine
that passed here, stop and diagnose before registering — do not register a plugin build whose own
test suite is red.

## Register

1. Connect to `org3a57b8d4.crm.dynamics.com`, solution `CommercialLendingLOS`.
2. Register a new assembly from `bin\Release\net462\CommercialLendingLOS.Plugins.dll`. Isolation
   mode: **Sandbox**. Secure/unsecure configuration: **blank** (see above).
3. Register **two** steps on `LoanDealGovernedTransitionPlugin`:

   | | Step A | Step B |
   |---|---|---|
   | Message | `Update` | `Update` |
   | Primary Entity | `cr664_loandeal` | `cr664_loandeal` |
   | Pipeline Stage | Pre-validation (10) | Pre-operation (20) |
   | Execution Mode | Synchronous | Synchronous |
   | Filtering Attributes | `cr664_stagereference, cr664_statusreference` | `cr664_stagereference, cr664_statusreference` |
   | Pre-Image | name **exactly** `PreImage`, attributes `cr664_stagereference, cr664_statusreference, cr664_amount, cr664_governedactionreason` | same |
   | Correlation Id propagation | automatic (platform-provided `context.CorrelationId`) | same |

   Both steps are load-bearing — see `ADR_001_PLATFORM_ENFORCED_CREDIT_WORKFLOW_GOVERNANCE.md` for
   why pre-validation alone leaves a narrow race window, and why pre-operation alone loses the
   durable rejection-audit trail (its writes roll back with the aborted transaction).

## Controlled bypass-attempt smoke test (run immediately after registering)

Use a `SYSTEM TEST -` prefixed deal for every step below — never a real deal.

1. **Direct stage-skip attempt.** As a signed-in test operator, issue a direct Dataverse Web API
   `PATCH` on a `SYSTEM TEST -` deal currently at `INTAKE`, setting `cr664_stagereference` directly
   to the `CREDIT_APPROVAL` reference row (skipping `UNDERWRITING`) — bypass the app UI entirely to
   prove the *server*, not the client, is the one rejecting this.
   - **Expected result:** the API call fails with an error whose message contains
     `"is not the next stage after"` (exact wording depends on which stage names were involved —
     the plugin's `Deny(...)` message is echoed verbatim as the Dataverse fault message).
   - **Expected evidence:** a new `cr664_auditevents` row for this deal, `cr664_auditeventname =
     "Governed Transition Rejected"`, `cr664_outcomestatus` = Blocked, `cr664_failurereason`
     containing the same message, `cr664_ChangedBy` bound to your real `cr664_user` record (not
     blank — if it IS blank/missing, your test user's `cr664_platformuser` bridge row is not
     resolving; fix that before treating this smoke as passed).
2. **Terminal-state mutation attempt.** Set a `SYSTEM TEST -` deal to `DECLINED`, then attempt any
   further direct stage or status write.
   - **Expected result:** rejected with a message containing `"is terminal; no further governed
     change is permitted"`.
3. **Unauthorized approval attempt.** As a test banker profile with `cr664_creditcommitteemember =
   false` and `cr664_approvaloverrideauthority = false`, attempt a direct
   `CREDIT_APPROVAL → COMMITMENT` write.
   - **Expected result:** rejected with `"requires credit committee authority"`.
4. **Unrelated-field write.** Directly `PATCH` only `cr664_amount` on a `SYSTEM TEST -` deal (no
   stage/status attribute in the same request).
   - **Expected result:** succeeds normally — the plugin does not fire at all for this write (its
     early-return on `!touchesStage && !touchesStatus` means zero added latency or side effects).
5. **Legitimate governed advance still works.** As a real signed-in banker, advance a
   `SYSTEM TEST -` deal through the app's own UI exactly one stage forward.
   - **Expected result:** succeeds, with the app's own readback/audit/timeline behavior unchanged
     from today (the plugin adds a second, server-side check of the same rule the client already
     enforces — it should be invisible on the happy path).

If any step's actual result doesn't match its expected result, **do not consider this deployed** —
capture the actual message/behavior and treat it as a live defect to diagnose before relying on this
as the security floor.

## Rollback

Disable (or delete) either plugin step via the Plugin Registration Tool to return instantly to
today's client-only enforcement — no schema change, no client redeploy required. See
`docs/governance/DEPLOYMENT_AND_ROLLBACK_PLAN.md` for the full sequencing.

## Evidence to capture and where it lives

Record, for your own change log (this is not the launch-evidence JSON format used elsewhere in this
repo — that format is for the five app-level launch-evidence capabilities, not this plugin):
- The exact assembly checksum you registered (`sha256sum` or `Get-FileHash` on
  `CommercialLendingLOS.Plugins.dll`).
- The registration timestamp and the identity that performed it.
- The five smoke-test results above, with the actual fault messages and the audit-row GUIDs from
  step 1.
- Confirmation that both steps (10 and 20) are enabled and correctly filtered, from the Plugin
  Registration Tool's own step list — a screenshot or exported registration XML is sufficient.

## Anything still not deployed after you follow this runbook

Note it in your own deployment log — this runbook only covers what the registering engineer needs
to do; it cannot confirm the outcome from this sandbox.
