# Phase 256A — Operator Launch Harness + Smoke Evidence Writer

## Outcome

**Adds the minimal operator-run harness + fail-closed smoke-evidence schema/parser/loader +
governance wiring needed to launch safely from the authorized operator session. NO gate was
flipped, NO live write was performed by the agent, NO `pac code push`. `enabledCount = 1/6`;
`fullLaunchAchieved = false`. Backend stays hydrated (CRM + portfolio).**

## What landed

- **Schema + parser** — `src/access/finalLaunchSmokeEvidence.ts` (PURE, no IO). One record per
  capability (`crmLivePersistence`, `portfolioBoarding`, `documentChecklist`, `borrowerSend`,
  `stageAdvancement`). `parseFinalLaunchSmokeEvidence` fails closed on any missing/invalid field.
  `isFinalLaunchSmokeGo` requires `outcome=passed` + `liveOperationPerformed` + `readbackVerified`
  + closure (rollback, or delivery/audit for `borrowerSend`). `toOperatorSmokeEvidence` adapts a
  record into the Phase 211 `operatorSmokeEvidenceRegistry` (the single GO source), downgrading a
  non-GO record to `failed` so the registry never infers a pass.
- **Loader** — `src/access/finalLaunchSmokeEvidenceLoader.ts` (node-only) reads
  `docs/operator-evidence/final-launch/*.json`, returns only records that validate, reports the
  rest as errors (never coerced to a pass). Kept out of the app bundle.
- **Readiness projection** — `src/activation/finalLaunchReadiness.ts`. `deriveFinalLaunchReadiness`
  projects `deploymentAllowed` = all five capabilities GO (via the registry) AND CRM+portfolio
  hydrated AND New Deal certified. It is a PROJECTION: it never reads or flips gate constants; the
  CURRENT `enabledCount`/`fullLaunchAchieved` continue to come from the fail-closed
  `productionEnvironmentVerification` (still 1/6, false).
- **Harness** — `scripts/dataverse/run-final-launch-smokes.ps1` (operator-run). Dry-run by default
  (validates `pac org who` + WhoAmI, prints the plan, writes nothing). `-Apply` runs automated
  CRUD smokes for CRM + portfolio against a launch-test-marked record (create → readback → update →
  readback → delete → confirm-deleted), writing a `passed` artifact ONLY when every step including
  cleanup succeeds; otherwise `failed` (fail closed). Live ops require a valid token + typed
  `LAUNCH-SMOKE` confirmation, and only ever touch records the script created. `documentChecklist`,
  `borrowerSend`, `stageAdvancement` are app-layer governed writes → `-RecordManualEvidence`
  validates an operator-supplied JSON (never invents). `borrowerSend` requires `VITE_EMAIL_MODE=LIVE`
  + an approved `-TestRecipient` + delivery/audit verification. No flag flip, no `pac code push`.
- **Evidence dir** — `docs/operator-evidence/final-launch/` (README only; empty until the operator
  runs the smokes).

## Why the agent did not run the live smokes

The Dataverse Web API token 401s in the agent's session (the agent's token identity is not a
provisioned application user — re-confirmed: `WhoAmI` = False), and a borrower send is an explicit
banker action. The live smokes are therefore operator-session actions. The agent built the harness
+ wiring instead, and will consume the real artifacts to flip gates in the next phase.

## Tests

`finalLaunchSmokeEvidence.test.ts` (parser fail-closed + GO + registry mapping),
`finalLaunchSmokeEvidenceLoader.test.ts` (node loader), `finalLaunchReadiness.test.ts` (no
artifacts → deploymentAllowed false, current 1/6, fullLaunch false; five valid synthetic artifacts
→ deploymentAllowed true + projected 6/6, **real gates unchanged**; invalid/missing/borrower-without-
delivery → blocked; flips no gate constant), and `phase256AOperatorLaunchHarness.test.ts` (real
empty dir → all blocked; harness invariants).

## Exact operator command to run the final smokes

```powershell
# In the authorized operator session (WhoAmI succeeds):
powershell -File scripts/dataverse/run-final-launch-smokes.ps1                                   # dry-run preview
powershell -File scripts/dataverse/run-final-launch-smokes.ps1 -Apply -Capability crmLivePersistence
powershell -File scripts/dataverse/run-final-launch-smokes.ps1 -Apply -Capability portfolioBoarding
# app-layer smokes: run the controlled in-app smoke, then record validated evidence:
powershell -File scripts/dataverse/run-final-launch-smokes.ps1 -RecordManualEvidence docs/operator-evidence/final-launch/documentChecklist.json
powershell -File scripts/dataverse/run-final-launch-smokes.ps1 -RecordManualEvidence docs/operator-evidence/final-launch/borrowerSend.json
powershell -File scripts/dataverse/run-final-launch-smokes.ps1 -RecordManualEvidence docs/operator-evidence/final-launch/stageAdvancement.json
```

Once all five artifacts validate `passed`, the next phase consumes them, flips each gate, and only
then runs the governed `pac code push`.
