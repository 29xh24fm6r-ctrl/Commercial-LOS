# Workstream 1 — Dataverse Governed-Transition Plugin

**Status: COMPLETE — AWAITING DEPLOYMENT.**

## What changed

`dataverse-plugins/CommercialLendingLOS.Plugins/LoanDealGovernedTransitionPlugin.cs` had never been
compiled or tested — it was authored in a prior session with no `dotnet` SDK available, reviewed
only by inspection. This session had a working .NET 8 SDK, which changed the reality:

- `dotnet build -c Release` succeeds cleanly (0 warnings, 0 errors).
- A new xUnit test project, `dataverse-plugins/CommercialLendingLOS.Plugins.Tests/` (41 tests),
  exercises the compiled `Execute()` method against a hand-rolled in-memory Dataverse fake
  (`FakeOrganizationService`, `FakePluginExecutionContext`, `FakeServiceProvider`) — no
  FakeXrmEasy dependency, no live org. It covers every transition class in
  `docs/governance/CANONICAL_TRANSITION_POLICY_CONTRACT.md`: valid sequential advances, skipped
  stages, returns, terminal-state protection (DECLINED/WITHDRAWN/BOARDED), the
  CREDIT_APPROVAL→COMMITMENT credit-authority sub-rules (limit, committee membership, override
  authority, missing profile, unconfigured authority, amount mismatch), inactive-stage handling,
  unrelated field updates, idempotent same-value writes, malformed/dangling references, message/
  entity/pipeline-stage filters, and the stage-10 durable rejection-audit write.

Two real hardening gaps were found and fixed by writing this suite (not hypothesized — reproduced
first, then fixed):

1. `ResolveStage`/`ResolveStatusCode` let a dangling/unresolvable reference (e.g. a deleted stage or
   status row) throw a raw, uncaught platform exception instead of the plugin's own safe,
   fail-closed denial message. Fixed: both now wrap their `Retrieve` call in try/catch and return
   `null` on any exception, exactly like every other unresolvable-reference path in the file.
2. A plain status-only change (touching `cr664_statusreference` without also touching
   `cr664_stagereference`) that was **not** literally DECLINED or WITHDRAWN was allowed through
   unconditionally — including a dangling/malformed status reference — because the code never
   checked that the new value resolved to any canonical status at all. Fixed: denies with "target
   status could not be resolved..." when unresolvable.

Neither fix changes the ratified policy itself — `src/workflow/governancePluginParityFixture.test.ts`
(the TypeScript-side pin of the plugin's literal constants) still passes unchanged, 6/6.

## What did NOT change

- The canonical stage/status vocabulary, terminal-status set, and credit-authority rule.
- Registration status — the plugin is **still not registered against any live Dataverse
  environment.** Every gate in `docs/remediation/
  FINAL_PRODUCTION_COMPLETION_LIFECYCLE_TRUTH_MATRIX_2026-07-22.md`'s truth table remains enforced
  100% client-side until an operator completes registration.

## Operator runbook

`docs/operator-runbooks/DATAVERSE_GOVERNANCE_PLUGIN_DEPLOYMENT.md` (new this pass) — exact
prerequisites, service-account/secure-config requirements, registration steps (message/entity/
pipeline stage/execution mode/filtering attributes/pre-image), and a controlled bypass-attempt
smoke test with expected fault messages and evidence to capture. Companion to the pre-existing
`dataverse-plugins/CommercialLendingLOS.Plugins/PLUGIN_DEPLOYMENT.md` (updated this pass to reflect
the compiled/tested state) and `docs/governance/DEPLOYMENT_AND_ROLLBACK_PLAN.md`.

## Classification

**COMPLETE — AWAITING DEPLOYMENT.** Registration requires `pac`/Plugin Registration Tool and live
Dataverse admin credentials this sandbox does not have.
