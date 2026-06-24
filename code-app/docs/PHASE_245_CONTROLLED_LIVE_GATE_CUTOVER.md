# Phase 245 — Controlled Live Gate Cutover for PASS Domains

## Outcome

**No live gate was flipped. `enabledCount = 1 / 6`. `fullLaunchAchieved = false`.
Deployment (`pac code push`) NOT performed.**

The three domains whose technical prerequisites read PASS — CRM writeback, portfolio
boarding, stage advancement — were taken through controlled-cutover **preparation**: the
governed live adapters are proven on the success / guardrail / rollback / blocked /
sink-failure paths by repo smoke tests, the exact gate + injection points are documented,
and a cutover-readiness ledger now tracks each. But the cutover is **not complete**, so
the gates stay controlled.

### Why the gates were not flipped

A gate flip requires real operator evidence that does not yet exist:

- **Live Dataverse schema is unverified.** `verify-full-schema.ps1` reports `live = 0/0`
  for both CRM and portfolio — the live `EntityDefinitions` check did not run. There is no
  `VerifiedCrmSchemaState` / `VerifiedBoardingSchemaState` to inject, and the runtime
  schema gates fail closed without one.
- **No controlled production smoke is recorded** for any of the three domains.

Flipping the certification toggles / gate flags now would mark the dashboard "enabled"
while the runtime still fail-closes — overstating readiness. That is the "fake PASS"
the spec's Section 2 forbids, so it was not done. The user confirmed the
governance-preserving path (prep + smoke tests, gates stay controlled).

## Gate + injection points (identified)

| Domain | Live gate flag(s) | Runtime gate | Resolver / injection point |
| --- | --- | --- | --- |
| CRM writeback | `CRM_LIVE_PERSISTENCE_ENABLED` | `deriveCrmRuntimeSchemaGate` (injected `VerifiedCrmSchemaState`) | `resolveCrmPersistenceAdapter` (injected `CrmDataverseTransport`) |
| Portfolio boarding | `PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED` + `PORTFOLIO_BOARDING_ROUTE_ENABLED` | `derivePortfolioBoardingRuntimeSchemaGate` (injected `VerifiedBoardingSchemaState`) | `resolvePortfolioLoanBoardingRuntimeAdapter` (injected `DataverseWriteClient`) |
| Stage advancement | `ADVANCE_STAGE_WRITE_ENABLED` / `AUTO_STAGE_ADVANCE_ENABLED` | ordering contract (`deriveStageReferenceReadiness`) | `advanceStage` (injected transport + audit + timeline sinks) |

Each runtime gate is fail-closed: even with the flag true, no write occurs without an
injected verified-schema state, an authorized operator, and a real transport.

## Which gates changed

**None.** All targeted gates remain at their committed source defaults:

```text
CRM_LIVE_PERSISTENCE_ENABLED                       = false  (unchanged)
PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED        = false  (unchanged)
PORTFOLIO_BOARDING_ROUTE_ENABLED                   = false  (unchanged)
ADVANCE_STAGE_WRITE_ENABLED / AUTO_STAGE_ADVANCE_ENABLED = false  (unchanged)
DOCUMENT_CHECKLIST_GENERATION_ENABLED              = false  (unchanged, untouched)
BORROWER_MESSAGING_ENABLED / BORROWER_EMAIL_TRANSPORT_ENABLED = false  (unchanged, untouched)
PRODUCTION_ENVIRONMENT_CERTIFICATION: only newDealCreate = true  (unchanged)
```

## Which gates did not change

All six. Document checklist and borrower send were explicitly not touched (they remain
UNKNOWN — lending-owner signoff and Outlook connector registration are still pending). New
Deal create remains live via the Phase 242A pilot.

## Smoke evidence

Repo cutover smoke tests (`src/activation/phase245ControlledLiveCutoverSmoke.test.ts`,
10 tests, all passing) exercise each governed adapter with injected mocks — **not** the
live SDK or real Dataverse:

- **CRM writeback** — success (verified schema + transport + authorized → live adapter
  resolves, write `written`); guardrail (missing required field → `validation_error`);
  rollback/disable (flag off / `enabled:false` → disabled adapter, `disabled`).
- **Portfolio boarding** — success (route + live + verified → `boarded`, child group
  `written`); missing/invalid prerequisite (`schema_not_verified`, `validation_error`);
  rollback/disable (route+live off → no create, `disabled`).
- **Stage advancement** — success single-record (`advanced`); blocked transition (terminal
  stage → `no_next_stage`); sink update failure (`update_failed`); rollback/disable
  (write flag off → `disabled`).

These prove the adapter logic is correct and fail-closed. They are **not** live operator
smoke evidence and do not substitute for the production schema verification + smoke.

## Remaining blockers for 6/6

| Domain | Remaining before its gate may flip |
| --- | --- |
| CRM writeback | Inject a real `VerifiedCrmSchemaState` (live schema currently `live=0/0`); record a controlled production writeback smoke; then flip `CRM_LIVE_PERSISTENCE_ENABLED`. |
| Portfolio boarding | Inject a real `VerifiedBoardingSchemaState`; enable the route; record a controlled boarding + failure smoke; then flip `PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED`. |
| Stage advancement | Inject live sinks; record advancement / blocked / update-failed production smokes; then flip the governed explicit-advancement gate. |
| Document checklist | Lending-owner rule-set signoff (still UNKNOWN). |
| Borrower send | Register/authorize the Office 365 Outlook connector; certify explicit live send (still UNKNOWN). |

Re-run `scripts/dataverse/run-full-activation-verification.ps1` until `ALL-PASS: True`
**and** the live schema + smokes are recorded before any governed gate flip.

## Rollback plan

Each domain has a one-line disable (flags are already false; these are the controls that
would disable a future flip):

- CRM writeback — set `CRM_LIVE_PERSISTENCE_ENABLED` to false.
- Portfolio boarding — set `PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED` + `PORTFOLIO_BOARDING_ROUTE_ENABLED` to false.
- Stage advancement — set the governed Advance Stage gate (`ADVANCE_STAGE_WRITE_ENABLED` / `AUTO_STAGE_ADVANCE_ENABLED`) to false.

This commit adds only tests, a read-only cutover-readiness ledger, evidence-model wording,
and this doc — it flips no live gate, so `git revert <commit>` is operationally a no-op.
